"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { clockOffset } from "@/lib/poll";
import { useServerNow } from "@/lib/use-poll";
import { shortDateTime } from "@/lib/text";
import type { QualifierView } from "../view";
import { closesIn, closingNote, isNewBest, leftNote, leftToday, livePhase, opensAgain, placeLine, points, ruleLines, untilText, usedAfterStart } from "../screen";
import { hoursState, type RunKind } from "../hours";
import { GAME_NAME } from "../paths";
import { qualifierFont } from "../font";
import { clearPending, expired, loadPending, mayDiscard, savePending, settle } from "../game/pending";
import { primeSound } from "../game/sound";
import type { SubmitBody, SubmitReason } from "../game/timeline";
import { SlimeGame, type StartAnswer, type SubmitAnswer } from "./game/SlimeGame";
import { ResultCard } from "./ResultCard";
import { Board } from "./Board";

type Stage =
  | { kind: "ready" }
  | { kind: "playing"; key: number } // SlimeGame is mounted: the run, then its submit
  | { kind: "result"; score: number; prevBest: number | null; practice: boolean }
  | { kind: "failed"; message: string };

const START_ERROR = "Couldn't start a run. Check your connection and try again.";
const PENDING_STUCK = "Your last run hasn't been sent yet. Check your connection and try again.";
const PENDING_KEPT = "Your last run is saved on this device. It will be sent when you're back online.";
/** A submit that hasn't answered by now is given up and counts as a network failure (R14): kept and sent again. */
const SUBMIT_TIMEOUT_MS = 15_000;
/** A key still held from the run must not start another the moment the result shows. */
const ENTER_GUARD_MS = 400;
const HOWTO_KEY = "qualifier-howto-seen";

// The 3D scene's chunk is fetched while the ready screen waits, once per page (SlimeGame still
// waits for it before a run starts).
let scenePrefetched = false;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The how-to shows until the first Play on this device. On the server (and so in the first
// render) it reads as seen: a first visit sees it appear, a returning player never sees it flash.
const howtoListeners = new Set<() => void>();
function subscribeHowto(on: () => void): () => void {
  howtoListeners.add(on);
  window.addEventListener("storage", on);
  return () => {
    howtoListeners.delete(on);
    window.removeEventListener("storage", on);
  };
}
function howtoSeen(): boolean {
  try {
    return storage()?.getItem(HOWTO_KEY) != null;
  } catch {
    return true;
  }
}
function markHowtoSeen(): void {
  try {
    storage()?.setItem(HOWTO_KEY, "1");
  } catch {
    // Not kept: the how-to shows again next time.
  }
  for (const on of howtoListeners) on();
}

const REASONS: readonly string[] = ["early", "late", "done", "refused", "invalid"];
function isSubmitAnswer(v: unknown): v is SubmitAnswer {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  if (a.ok === true) {
    return typeof a.score === "number" && (a.prevBest === null || typeof a.prevBest === "number")
      && typeof a.view === "object" && a.view !== null;
  }
  return a.ok === false && typeof a.reason === "string" && REASONS.includes(a.reason);
}

/**
 * Sends a finished run. Anything but a real answer (no connection, a server error, a rate
 * limit, no answer within SUBMIT_TIMEOUT_MS) rejects, which the callers treat as a network
 * failure: the run stays kept on the device and is sent again. No `keepalive`: a long run's
 * timeline is past its 64 KB limit, and the kept copy already covers a page that goes away.
 */
async function postSubmit(token: string, body: SubmitBody): Promise<SubmitAnswer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/qualifier/${token}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    const answer: unknown = await res.json().catch(() => null);
    if (isSubmitAnswer(answer)) return answer;
    throw new Error(`The submit answered ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Why a finished run did not count, in the player's words. */
function refusedText(reason: SubmitReason): string {
  switch (reason) {
    case "late": return "That run reached us too late to count.";
    // After a lost answer the run may have counted on an earlier try.
    case "done": return "That run was already sent, or a newer run replaced it — reload to see the board.";
    default: return "That run couldn't be counted.";
  }
}

/**
 * Slime Splat on the attendee's phone or laptop (D772, D795, D797), on the portal's Games page:
 * ready → the game (SlimeGame, a full-screen overlay) → result, and the leaderboard. The server
 * owns the run (D771): it picks the seed and the start time, and replays the keystrokes to score it.
 *
 * - **Play** mounts SlimeGame inside the click (flushSync), asks for fullscreen on its overlay
 *   on a laptop and unlocks the sound, all while the gesture still counts. Enter plays too.
 * - **A kept run.** A finished run whose submit never got a final answer is kept on the device
 *   (one per token, game/pending). It is sent on mount and whenever the page comes back into
 *   view or online, but never while a SlimeGame is mounted (that game sends its own run, and
 *   the two would race), and before Play starts a new run: a new run would replace the kept one
 *   (on the device and, by abandoning it, on the server). If it can't be sent, the start says so,
 *   and after DISCARD_AFTER_TRIES failed tries offers to discard it. One kept past any submit
 *   window is dropped (`expired`): the server could only answer "late".
 * - **Practice and official (D909).** An event with practice runs (D907) offers two buttons, each
 *   with what is left today; one that only limits its runs (D913) keeps the one Play button, with
 *   what is left on it; the choice rides to the server with the start, which alone decides.
 *   An attempt is used when the run starts (on the game's Start, after its title screen), so
 *   Enter never opens the game here: an official attempt is always a deliberate tap. Outside the
 *   play hours (D908) the buttons give way to when the game opens again, by the clock.
 */
export function QualifierClient({ token, initial }: { token: string; initial: QualifierView }) {
  const [view, setView] = useState(initial);
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const howtoDone = useSyncExternalStore(subscribeHowto, howtoSeen, () => true);
  const overlay = useRef<HTMLDivElement>(null);
  /** A SlimeGame is mounted (playing or sending): nothing else sends a run. */
  const gameOn = useRef(false);
  const runKey = useRef(0);
  /** The kind of the mounted game's run; null where the event has no kinds (every run official). */
  const [runKind, setRunKind] = useState<RunKind | null>(null);
  const runKindRef = useRef<RunKind | null>(null);
  const resultAt = useRef(0);
  const flushing = useRef<Promise<"none" | "sent" | "failed"> | null>(null);

  const playing = stage.kind === "playing";
  const now = useServerNow(offset, 1000, !playing);
  const phase = livePhase(view.phase, view.opensAt, view.closesAt, now);
  const open = phase === "open";
  const hours = hoursState(view.playHours, now);
  const shut = open && !hours.open ? opensAgain(hours.opensAt, now) : null;
  const canPlay = open && shut === null;
  const kinds = (view.limits.practice ?? 0) > 0;
  /** One kind of run, so many a day (D913): one Play button that counts down. */
  const capped = !kinds && view.limits.official !== null;
  const left = leftToday(view, now);
  // What each button may start now: the page's guess; the server decides (D907).
  const canPractice = canPlay && left.practice !== 0;
  const canOfficial = canPlay && left.official !== 0;

  /** Sends the kept run, if any. One send at a time: a second caller waits for the first. */
  const flushPending = useCallback((): Promise<"none" | "sent" | "failed"> => {
    if (flushing.current) return flushing.current;
    const p = (async () => {
      const store = storage();
      const kept = loadPending(store, token);
      if (!kept) return "none" as const;
      // Past any submit window the server could only say "late": drop it and let Play go ahead.
      if (expired(kept, Date.now())) {
        clearPending(store, token);
        setNotice(`Your last run didn't count. ${refusedText("late")}`);
        return "none" as const;
      }
      const still = () => loadPending(store, token)?.runId === kept.runId;
      let answer: SubmitAnswer | null = null;
      try {
        answer = await postSubmit(token, kept.body);
      } catch {
        answer = null;
      }
      if (!answer || settle(answer.ok ? "ok" : answer.reason) === "retry") {
        if (still()) savePending(store, token, { ...kept, tries: kept.tries + 1 });
        return "failed" as const;
      }
      if (still()) clearPending(store, token);
      if (answer.ok) {
        setView(answer.view);
        setNotice(answer.kind === "practice"
          ? `Your last practice run was sent: ${points(answer.score)} points. It doesn't count.`
          : `Your last run was sent: ${points(answer.score)} points.`);
      } else if (answer.reason !== "done") {
        setNotice(`Your last run didn't count. ${refusedText(answer.reason)}`);
      } else {
        setNotice(null);
      }
      return "sent" as const;
    })().finally(() => {
      flushing.current = null;
    });
    flushing.current = p;
    return p;
  }, [token]);

  // A kept run goes out when the page opens, comes back into view or comes back online.
  useEffect(() => {
    const retry = () => {
      if (!gameOn.current && document.visibilityState === "visible") void flushPending();
    };
    retry();
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
    };
  }, [flushPending]);

  /** SlimeGame's start: the kept run first, then a new run from the server. */
  const start = useCallback(async (): Promise<StartAnswer> => {
    // SlimeGame times the server's clock around this whole call; a kept run sent first would
    // skew that by half its round trip, so `serverNow` is moved back by as much (D257's midpoint).
    const called = Date.now();
    if ((await flushPending()) === "failed") {
      // After a few failed tries the player may give the kept run up and play (SlimeGame clears it).
      return { error: PENDING_STUCK, discard: mayDiscard(loadPending(storage(), token)) };
    }
    const sent = Date.now();
    const kind = runKindRef.current;
    const res = await fetch(`/api/qualifier/${token}/start`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: kind ?? "official" }),
    });
    const body = (await res.json().catch(() => null)) as
      | { runId?: unknown; startsAt: string; serverNow: number; seed: number; error?: string; refused?: string }
      | null;
    const received = Date.now();
    if (!res.ok || !body || typeof body.runId !== "string") {
      // Used up elsewhere (another tab or device): the button says so from now on.
      if (kind && body?.refused === "limit") {
        setView((v) => ({ ...v, used: { ...usedAfterStart(v.used, kind, Date.now()), [kind]: v.limits[kind] ?? 0 } }));
      }
      return { error: body?.error ?? START_ERROR };
    }
    setOffset(clockOffset(sent, received, body.serverNow));
    // The attempt is used now, whatever becomes of the run, on the day its countdown ends (as the database counts).
    if (kind) setView((v) => ({ ...v, used: usedAfterStart(v.used, kind, Date.parse(body.startsAt)) }));
    return { runId: body.runId, startsAt: body.startsAt, seed: body.seed, serverNow: body.serverNow - (sent - called) / 2 };
  }, [token, flushPending]);

  const submit = useCallback((body: SubmitBody) => postSubmit(token, body), [token]);

  const onDone = useCallback((answer: SubmitAnswer) => {
    gameOn.current = false;
    resultAt.current = performance.now();
    if (answer.ok) {
      setView(answer.view);
      setStage({ kind: "result", score: answer.score, prevBest: answer.prevBest, practice: runKindRef.current === "practice" });
    } else {
      setStage({ kind: "failed", message: refusedText(answer.reason) });
    }
  }, []);

  // A counted run shows its results in the game (D816); the board here catches up behind it.
  const onScored = useCallback((answer: Extract<SubmitAnswer, { ok: true }>) => { setView(answer.view); }, []);

  const onExit = useCallback(() => {
    gameOn.current = false;
    resultAt.current = performance.now();
    setNotice(loadPending(storage(), token) ? PENDING_KEPT : null);
    setStage({ kind: "ready" });
  }, [token]);

  const play = useCallback((kind: RunKind = "official") => {
    if (gameOn.current || !(kind === "practice" ? canPractice : canOfficial)) return;
    gameOn.current = true;
    runKindRef.current = kinds ? kind : capped ? "official" : null;
    setRunKind(runKindRef.current);
    primeSound();
    markHowtoSeen();
    setNotice(null);
    runKey.current += 1;
    // Mounted now, inside the gesture: fullscreen and a phone's keyboard both need it.
    flushSync(() => setStage({ kind: "playing", key: runKey.current }));
    const el = overlay.current;
    // A phone fills the area above its keyboard instead (iPhone can't fullscreen an element).
    if (el && !window.matchMedia?.("(pointer: coarse)").matches) {
      try {
        el.requestFullscreen?.()?.catch(() => {});
      } catch {
        // Refused: the overlay fills the window and the run carries on.
      }
    }
  }, [canPractice, canOfficial, kinds, capped]);

  // While Play is on offer, fetch the scene's chunk and the slime model when the browser is idle.
  const onReady = stage.kind === "ready" && canPlay;
  useEffect(() => {
    if (!onReady || scenePrefetched) return;
    const fetchScene = () => {
      scenePrefetched = true;
      import("./game/SlimeScene").then((m) => m.loadSlimeModel()).catch(() => {
        scenePrefetched = false; // SlimeGame loads it again (and says so if it can't)
      });
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(fetchScene, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(fetchScene, 1000);
    return () => clearTimeout(id);
  }, [onReady]);

  // Enter plays (again) from the ready, result and failed screens, where there is one kind of run.
  useEffect(() => {
    if (kinds) return;
    const onKey = (e: KeyboardEvent) => {
      // A held key repeats: only a fresh press plays.
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.defaultPrevented || gameOn.current || !canPlay) return;
      const el = e.target as HTMLElement | null;
      // Another field's or a button's own Enter (a focused Play button clicks itself).
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName))) return;
      if (performance.now() - resultAt.current < ENTER_GUARD_MS) return;
      e.preventDefault();
      play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canPlay, kinds, play]);

  const line = placeLine({ best: view.me.best, rank: view.me.rank, total: view.me.total, phase });
  const showCockpit = open || stage.kind !== "ready";
  const actions = (again: boolean) => (
    <PlayActions kinds={kinds} canPlay={canPlay} left={left} again={again} onPlay={play}
      shut={shut} />
  );

  return (
    <div className={`${qualifierFont.variable} flex flex-col gap-6`}>
      {phase === "unset" && (
        <Notice title="Not open yet">{GAME_NAME} hasn&apos;t opened yet. Check back soon.</Notice>
      )}
      {phase === "before" && view.opensAt && (
        <Notice title={`Opens ${shortDateTime(view.opensAt)}`}>
          <span suppressHydrationWarning>in {untilText(Date.parse(view.opensAt) - now)}</span>
        </Notice>
      )}
      {phase === "closed" && (
        <Notice title={`${GAME_NAME} is closed`}>
          {view.me.rank !== null && <>You finished #{view.me.rank} of {view.me.total}.</>}
        </Notice>
      )}

      {showCockpit && (
        <div className="rounded-3xl bg-card p-4 text-card-foreground shadow-sm">
          {stage.kind === "result" ? (
            <ResultCard score={stage.score} best={view.me.best} line={line} practice={stage.practice}
              newBest={!stage.practice && isNewBest(stage.score, stage.prevBest)}>
              {actions(true)}
            </ResultCard>
          ) : stage.kind === "failed" ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <p role="alert" className="font-game text-2xl leading-tight">{stage.message}</p>
              {actions(true)}
            </div>
          ) : (
            <Ready view={view} line={line} closes={view.closesAt && open ? closesIn(Date.parse(view.closesAt), now) : null}
              closing={view.closesAt && canPlay ? closingNote(Date.parse(view.closesAt), now) : null}
              howto={!howtoDone} notice={notice}>
              {actions(false)}
            </Ready>
          )}
        </div>
      )}

      {phase !== "unset" && phase !== "before" && <Board view={view} phase={phase} now={now} />}

      {stage.kind === "playing" && (
        <SlimeGame key={stage.key} ref={overlay} token={token} kind={runKind} solo={!kinds} start={start} submit={submit} onDone={onDone} onScored={onScored} onExit={onExit} />
      )}
    </div>
  );
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-muted p-6 text-center">
      <p className="font-game text-2xl leading-tight">{title}</p>
      {children && <p className="text-base text-muted-foreground">{children}</p>}
    </div>
  );
}

/**
 * The way into a run (D909). One kind of run: Play, as ever. Two: a button each, with what is
 * left today, off once that is nothing. `shut` (outside the play hours, D908) replaces them
 * with when the game opens again.
 */
function PlayActions({ kinds, canPlay, left, shut, again, onPlay }: {
  kinds: boolean; canPlay: boolean; left: { practice: number | null; official: number | null };
  shut: string | null; again: boolean; onPlay(kind?: RunKind): void;
}) {
  if (shut) return <p role="status" className="font-game text-2xl leading-tight" suppressHydrationWarning>{shut}</p>;
  if (!canPlay) return null;
  if (!kinds) {
    return (
      <>
        <Button disabled={left.official === 0} onClick={() => onPlay()}
          className={`w-full max-w-xs flex-col gap-0 font-game leading-tight ${again ? "h-14 text-2xl" : "h-16 text-3xl"}`}>
          {again ? "Play again" : "Play"}
          {leftNote(left.official) && (
            <span className="font-sans text-xs font-bold tabular-nums opacity-80" suppressHydrationWarning>{leftNote(left.official)}</span>
          )}
        </Button>
        {left.official !== 0 && <p className="hidden text-xs text-muted-foreground pointer-fine:block">or press Enter</p>}
      </>
    );
  }
  const button = (kind: RunKind, label: string, variant: "default" | "outline") => {
    const note = leftNote(left[kind]);
    return (
      <Button variant={variant} disabled={left[kind] === 0} className="h-16 w-full flex-col gap-0 font-game text-2xl leading-tight"
        onClick={() => onPlay(kind)}>
        {label}
        {note && <span className="font-sans text-xs font-bold tabular-nums opacity-80" suppressHydrationWarning>{note}</span>}
      </Button>
    );
  };
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      {button("practice", "Practice", "outline")}
      {button("official", "Official attempt", "default")}
    </div>
  );
}

function Ready({ view, line, closes, closing, howto, notice, children }: {
  view: QualifierView; line: string; closes: string | null; closing: string | null; howto: boolean; notice: string | null;
  children: React.ReactNode;
}) {
  const { best, rank, total } = view.me;
  const rules = ruleLines(view);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <dl className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Your best</dt>
          <dd className="font-game text-3xl tabular-nums">{best === null ? "—" : points(best)}</dd>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Rank</dt>
          <dd className="font-game text-3xl tabular-nums">{rank === null ? "—" : `#${rank}`}<span className="ml-1 text-sm text-muted-foreground">{rank === null ? "" : `of ${total}`}</span></dd>
        </div>
      </dl>
      <p className="font-bold">{line}</p>
      {closes && <p className="text-sm text-muted-foreground tabular-nums" suppressHydrationWarning>{closes}</p>}
      {closing && <p role="status" className="text-sm font-bold text-primary" suppressHydrationWarning>{closing}</p>}
      {howto && (
        <div className="text-sm text-muted-foreground">
          <p>Type a slime&apos;s word to pop it before it bites. You have 3 minutes, and the last boss is the final slime.</p>
          {rules.length === 0 && <p>Play as often as you like — your best run counts.</p>}
        </div>
      )}
      {notice && <p role="status" className="text-sm font-bold">{notice}</p>}
      {children}
      {rules.length > 0 && (
        <ul className="flex w-full max-w-xs flex-col gap-1 text-left text-sm text-muted-foreground">
          {rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
