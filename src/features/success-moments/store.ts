/**
 * D902: the one success moment that can be playing at a time - an attendee's Book or Submit, from
 * the tap to the glow on what it made.
 *
 *   idle -> busy        the button was pressed and the server is working (it shrinks and spins)
 *   busy -> ok          the server said yes (the circle turns green and draws a tick)
 *   ok -> closing       a beat later, the dialog it was pressed in closes
 *   closing -> landing  the new page is let in, and what the moment made glows once
 *   landing -> idle
 *   busy -> idle        a refusal, or no answer at all: the circle opens back into the button
 *
 * "Yes" is the ok flash the server action redirects with. The redirect's new page arrives in the
 * same commit as that flash, and Next mounts it afresh (the page's search params are part of its
 * key), which would take the dialog and its tick away at once. So MomentGate, in the portal layout,
 * sees the ok flash while the new page is still being rendered and suspends that render on
 * `landing` - React keeps showing the old page meanwhile, and the old page's button and dialog keep
 * updating from this store - until the tick has drawn and the dialog has closed.
 *
 * A module store like the toasts' (src/lib/toast-store.ts), so the button, the gate and the dialog
 * need no provider between them.
 */
export type MomentPhase = "idle" | "busy" | "ok" | "closing" | "landing";
export type Moment = { phase: MomentPhase; owner: string | null; seq: number };

export const MOMENT_TIMING = {
  /** From the server's yes until the dialog starts to close: the tick draws in the first 240ms. */
  hold: 420,
  /** The dialog's own close (duration-100 in src/components/ui/dialog.tsx), plus a frame or two. */
  close: 140,
  /**
   * How long landing lasts. The new page commits a moment after landing begins, and its flash then
   * asks whether a moment already said it - so this outlasts that render with room to spare.
   */
  settle: 1000,
  /** A busy moment that hears nothing gives up, so a page is never held for good. */
  stuck: 30_000,
} as const;

const IDLE: Moment = { phase: "idle", owner: null, seq: 0 };

let moment: Moment = IDLE;
const listeners = new Set<() => void>();
let timers: ReturnType<typeof setTimeout>[] = [];
/** What was marked `data-moment-key` on the page when the button was pressed (for the glow). */
let before: Set<string> | null = null;
/** Resolves when the new page may come in: at landing, or whenever the moment ends. */
let gate: { promise: Promise<void>; open: () => void } | null = null;

function publish(next: Moment) {
  moment = next;
  if (next.phase === "landing" || next.phase === "idle") openGate();
  for (const listen of listeners) listen();
}

function openGate() {
  gate?.open();
  gate = null;
}

function later(ms: number, run: () => void) {
  timers.push(setTimeout(run, ms));
}

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

export function subscribeMoment(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getMoment(): Moment {
  return moment;
}

/** The server never has a moment playing; a stable reference, as useSyncExternalStore needs. */
export function getServerMoment(): Moment {
  return IDLE;
}

/**
 * A button was pressed. `owner` is that button's id, so only it changes shape; `seen` is the page's
 * moment keys at the press, so the glow can find what is new.
 */
export function beginMoment(owner: string, seen: Set<string> | null = null) {
  clearTimers();
  openGate();
  let open = () => {};
  const promise = new Promise<void>((resolve) => { open = resolve; });
  gate = { promise, open };
  before = seen;
  publish({ phase: "busy", owner, seq: moment.seq + 1 });
  later(MOMENT_TIMING.stuck, () => { if (moment.phase === "busy") endMoment(); });
}

/**
 * The server said yes. True when a moment is (or was just) playing for it, so the caller keeps its
 * toast out of sight; the gate gets there first and the flash's own effect asks again, so a second
 * call is a yes too and changes nothing. With reduced motion there is no tick to wait for, so the
 * dialog closes at once.
 */
export function momentSucceeded(reduced = false): boolean {
  if (moment.phase === "idle") return false;
  if (moment.phase !== "busy") return true;
  clearTimers();
  publish({ ...moment, phase: "ok" });
  const hold = reduced ? 0 : MOMENT_TIMING.hold;
  later(hold, () => publish({ ...moment, phase: "closing" }));
  later(hold + MOMENT_TIMING.close, () => publish({ ...moment, phase: "landing" }));
  later(hold + MOMENT_TIMING.close + MOMENT_TIMING.settle, endMoment);
  return true;
}

/**
 * Called by MomentGate while it renders the page an ok flash came back with: the promise that page
 * must wait on, or null to let it straight in. A busy moment learns its yes here - after the render,
 * since a store must not change under a render that is reading it.
 */
export function holdFor(reduced = false): Promise<void> | null {
  if (moment.phase === "busy") {
    queueMicrotask(() => momentSucceeded(reduced));
    return gate?.promise ?? null;
  }
  if (moment.phase === "ok" || moment.phase === "closing") return gate?.promise ?? null;
  return null;
}

/** The server said no: the button opens back up and the page shows the refusal. */
export function momentFailed() {
  if (moment.phase === "busy") endMoment();
}

/**
 * The button's form stopped working without an ok flash - a step that answers in place, as a
 * booking form's refusal does. Only the button that started the moment may end it.
 */
export function momentUnanswered(owner: string) {
  if (moment.phase === "busy" && moment.owner === owner) endMoment();
}

/** The keys seen at the press, once: the glow takes them when the new page is in. */
export function takeBefore(): Set<string> | null {
  const seen = before;
  before = null;
  return seen;
}

/** Back to idle, keeping `seq` so a dialog can tell this moment from the next. */
export function endMoment() {
  clearTimers();
  before = null;
  if (moment.phase === "idle") return openGate();
  publish({ phase: "idle", owner: null, seq: moment.seq });
}

/** Test seam: the store outlives any one test. */
export function resetMoment() {
  clearTimers();
  before = null;
  openGate();
  publish(IDLE);
}
