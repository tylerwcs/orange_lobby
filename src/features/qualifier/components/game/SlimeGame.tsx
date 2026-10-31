"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { backoff, clockOffset } from "@/lib/poll";
import { qualifierFont } from "../../font";
import { advance, currentWord, newGame, press, type Game, type GameEvent } from "../../game/engine";
import { perfOrigin } from "../../game/keys";
import { SKY, SLIMES, css } from "../../game/palette";
import { clearPending, savePending, settle } from "../../game/pending";
import { hasWebGL, qualityOf } from "../../game/quality";
import type { RunResult } from "../../game/replay";
import { isMuted, primeSound, setMuted, sfx } from "../../game/sound";
import { encodeTimeline, type Entry, type SubmitBody, type SubmitReason } from "../../game/timeline";
import { GameHud, type HudState } from "./GameHud";
import { GameInput, type GameInputHandle } from "./GameInput";
import { drainEvents } from "./sceneEvents";

const loadScene = () => import("./SlimeScene");
const SlimeScene = dynamic(loadScene, { ssr: false });

export type StartAnswer = { runId: string; startsAt: string; serverNow: number; seed: number } | { error: string };
/** `view` is the refreshed qualifier view; typed `unknown` until the view's new shape lands (Task 6). */
export type SubmitAnswer = { ok: true; score: number; prevBest: number | null; view: unknown } | { ok: false; reason: SubmitReason };

export type SlimeGameProps = {
  /** The attendee's token: the key the unsent run is kept under on this device. */
  token: string;
  /** Starts a run on the server. May reject; a rejection reads as a failed start. */
  start: () => Promise<StartAnswer>;
  /** Sends the finished run. Rejects on a network failure (or a server error): the run is kept and sent again. */
  submit: (body: SubmitBody) => Promise<SubmitAnswer>;
  /** A final answer for the run (accepted or refused), with what this phone's engine made of it. */
  onDone: (answer: SubmitAnswer, local: RunResult) => void;
  /** The player leaves without a result (no 3D, a failed start, a submit that can't get through yet). */
  onExit: () => void;
  /** The overlay element: the parent calls `requestFullscreen?.()` on it inside the Play click. */
  ref?: Ref<HTMLDivElement>;
};

type Stage =
  | { kind: "nogl" }
  | { kind: "starting" }
  | { kind: "failed"; message: string }
  | { kind: "run"; origin: number }
  | { kind: "sending"; offline: boolean };

const NO_GL = "This game needs a browser with 3D graphics turned on.";
const SCENE_FAILED = "The 3D view stopped working. Your run finishes on its own.";
const START_ERROR = "Couldn't start a run. Check your connection and try again.";
/** The server said the run can't have ended yet (this phone's clock ran ahead): ask again soon. */
const EARLY_RETRY_MS = 2000;

const EMPTY_HUD: HudState = { score: 0, combo: 0, health: 0, word: null, typed: 0 };

const lockedOf = (g: Game) => (g.lock === null ? undefined : g.slimes.find((s) => s.id === g.lock));

function hudOf(g: Game): HudState {
  const s = lockedOf(g);
  return { score: g.score, combo: g.combo, health: g.health, word: s ? currentWord(s) : null, typed: s ? s.typed : 0 };
}

const sameHud = (a: HudState, b: HudState) =>
  a.score === b.score && a.combo === b.combo && a.health === b.health && a.word === b.word && a.typed === b.typed;

/** 3-2-1 before the start (clamped, so a start that arrives late or early still reads sensibly), 0 after. */
const countOf = (t: number) => (t >= 0 ? 0 : Math.min(3, Math.max(1, Math.ceil(-t / 1000))));

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Waits `ms`, or less if the page comes back into view or back online (a good moment to retry). */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("online", done);
      resolve();
    };
    const seen = () => { if (document.visibilityState === "visible") done(); };
    const timer = setTimeout(done, ms);
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("online", done);
  });
}

/** The overlay's box on a phone: the visual viewport, i.e. the area above the on-screen keyboard. */
function subscribeViewport(on: () => void): () => void {
  const v = window.visualViewport;
  v?.addEventListener("resize", on);
  v?.addEventListener("scroll", on);
  return () => {
    v?.removeEventListener("resize", on);
    v?.removeEventListener("scroll", on);
  };
}
const viewportSnapshot = () => {
  const v = window.visualViewport;
  return v ? `${v.height}:${v.offsetTop}` : "";
};

/**
 * One slime run (D794), as a full-screen overlay over the portal: start → 3-2-1 → play until the
 * engine ends the run → submit the keystroke timeline → `onDone`.
 *
 * - **Clock.** The run's origin is the server's `startsAt` on this page's `performance.now()`
 *   clock (`perfOrigin`, with the server offset measured around `start()`). Every frame and every
 *   key use the same integer `t = Math.round(performance.now() - origin)`: the frame loop calls
 *   `advance(game, t)`; a key calls `advance(game, t)` first and is pressed and recorded only if
 *   the run is still on after that (R7). Keys before the start are dropped. There is no other
 *   simulation: what is recorded is exactly what the engine was fed, so the server's replay agrees.
 * - **Events (R11).** While the scene is loaded and healthy it drains `game.events` and hands
 *   each to `onEvent` (sound) and `onHit` (the goo flash). Before it loads, or once it has
 *   failed, this component drains them itself each frame with the same handlers. A failed scene is
 *   unmounted and the run plays out without it (R12); the run is replayable whatever the graphics.
 * - **Submit.** The finished body is kept on the device (`savePending`) before it is sent; a final
 *   answer clears it, "early" and network failures keep it and retry (sooner when the page comes
 *   back into view or online). The player can leave while it retries: the portal sends the kept
 *   run on its next visit.
 * - **Screen.** `fixed inset-0 z-[100]`, the body scroll locked while open, its height following
 *   `visualViewport` so on a phone the scene sits above the keyboard. Fullscreen is the parent's
 *   (it must be asked inside the Play click, on `ref`); a refusal or Esc leaves the overlay filling
 *   the window and the run carries on. Removing the overlay ends fullscreen (the browser exits it
 *   when the fullscreen element leaves the page).
 * - **Input.** One always-focused native box (`GameInput`); any tap on the overlay, a stray
 *   letter typed elsewhere or leaving fullscreen puts the focus back.
 *
 * No pause: a hidden tab stops the frames, and the engine catches up on the next one.
 */
export function SlimeGame({ token, start, submit, onDone, onExit, ref }: SlimeGameProps) {
  const [stage, setStage] = useState<Stage>(() => (hasWebGL() ? { kind: "starting" } : { kind: "nogl" }));
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [count, setCount] = useState(3);
  const [lockId, setLockId] = useState<number | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const [slow, setSlow] = useState(false);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [reducedMotion] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => "");

  const game = useRef<Game | null>(null);
  const entries = useRef<Entry[]>([]);
  const runId = useRef("");
  const origin = useRef<number | null>(null);
  const input = useRef<GameInputHandle>(null);
  const flash = useRef<HTMLDivElement>(null);
  const bossIds = useRef(new Set<number>());
  /** The scene is loaded and healthy, so it drains `game.events` (R11). */
  const sceneDrains = useRef(false);
  const started = useRef(false);
  const finishing = useRef(false);
  const alive = useRef(true);
  const lastHud = useRef<HudState>(EMPTY_HUD);
  const latest = useRef({ token, start, submit, onDone });
  useEffect(() => { latest.current = { token, start, submit, onDone }; }, [token, start, submit, onDone]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => lockBodyScroll(), []);

  // ---- Sound and the goo flash, from the engine's events (whoever drains them). ----
  const onEvent = useCallback((e: GameEvent) => {
    if (e.type === "boss") {
      if (e.id !== undefined) bossIds.current.add(e.id);
      sfx("boss");
    } else if (e.type === "pop") sfx(e.id !== undefined && bossIds.current.has(e.id) ? "splat" : "pop");
    else if (e.type === "word") sfx("pop");
    else if (e.type === "explode") sfx("hit");
    else if (e.type === "wrong") sfx("wrong");
  }, []);
  const onHit = useCallback(() => {
    flash.current?.animate?.([{ opacity: 0.9 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
  }, []);
  const handlers = useRef({ onEvent, onHit });

  const syncHud = useCallback(() => {
    const g = game.current;
    if (!g) return;
    const next = hudOf(g);
    if (!sameHud(next, lastHud.current)) {
      lastHud.current = next;
      setHud(next);
    }
    setLockId(g.lock);
  }, []);

  // ---- The scene: loaded once WebGL is there, unmounted for good if it fails. ----
  const gl = stage.kind !== "nogl";
  useEffect(() => {
    if (!gl) return;
    let on = true;
    loadScene().then(
      () => {
        if (!on) return;
        sceneDrains.current = true;
        setSceneLoaded(true);
      },
      () => {
        if (!on) return;
        sceneDrains.current = false;
        setSceneFailed(true);
      },
    );
    return () => { on = false; };
  }, [gl]);

  const onSceneFail = useCallback(() => {
    sceneDrains.current = false; // from now on the loop drains (R11)
    setSceneFailed(true);
  }, []);
  const onSlow = useCallback(() => setSlow(true), []);

  // ---- Start. ----
  const begin = useCallback(async () => {
    setStage({ kind: "starting" });
    const sent = Date.now();
    let answer: StartAnswer;
    try {
      answer = await latest.current.start();
    } catch {
      answer = { error: START_ERROR };
    }
    const received = Date.now();
    if (!alive.current) return;
    if ("error" in answer) {
      setStage({ kind: "failed", message: answer.error || START_ERROR });
      return;
    }
    const offset = clockOffset(sent, received, answer.serverNow);
    const o = perfOrigin(Date.parse(answer.startsAt), offset, Date.now(), performance.now());
    const g = newGame(answer.seed);
    game.current = g;
    entries.current = [];
    runId.current = answer.runId;
    origin.current = o;
    bossIds.current.clear();
    lastHud.current = hudOf(g);
    setHud(lastHud.current);
    setCount(countOf(Math.round(performance.now() - o)));
    setStage({ kind: "run", origin: o });
  }, []);

  useEffect(() => {
    // Once per mount (a StrictMode re-run must not start a second run).
    if (started.current || stage.kind !== "starting") return;
    started.current = true;
    void begin();
  }, [stage.kind, begin]);

  // ---- Submit, until a final answer (or the player leaves). ----
  const finishRun = useCallback(async () => {
    const g = game.current;
    if (!g || finishing.current) return;
    finishing.current = true;
    const local: RunResult = { score: g.score, endedMs: g.endedMs ?? g.nowMs, popped: g.popped, bosses: g.bosses };
    const body: SubmitBody = { runId: runId.current, device: input.current?.device() ?? "unknown", ...encodeTimeline(entries.current) };
    const { token: tok } = latest.current;
    const store = storage();
    let tries = 0;
    savePending(store, tok, { runId: body.runId, body, tries });
    setStage({ kind: "sending", offline: false });
    while (alive.current) {
      let answer: SubmitAnswer | null = null;
      try {
        answer = await latest.current.submit(body);
      } catch {
        answer = null;
      }
      const said = answer === null ? "network" : answer.ok ? "ok" : answer.reason;
      if (answer && settle(said) === "clear") {
        clearPending(store, tok);
        if (alive.current) latest.current.onDone(answer, local);
        return;
      }
      tries += 1;
      savePending(store, tok, { runId: body.runId, body, tries });
      if (!alive.current) return;
      setStage({ kind: "sending", offline: said === "network" });
      await pause(said === "early" ? EARLY_RETRY_MS : backoff(tries));
    }
  }, []);

  // ---- The frame loop: the clock, the engine, the HUD. ----
  useEffect(() => {
    if (stage.kind !== "run") return;
    const o = stage.origin;
    let raf = 0;
    let shown = -1;
    const frame = () => {
      const g = game.current;
      if (!g) return;
      const t = Math.round(performance.now() - o);
      if (t >= 0) advance(g, t);
      if (!sceneDrains.current) drainEvents(g, handlers.current);
      const c = countOf(t);
      if (c !== shown) {
        shown = c;
        setCount(c);
      }
      syncHud();
      if (g.ended) {
        void finishRun();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [stage, syncHud, finishRun]);

  // ---- Keys. ----
  const apply = useCallback((keysOf: (g: Game) => string[], insert: boolean) => {
    primeSound();
    const g = game.current;
    const o = origin.current;
    if (!g || o === null || g.ended || finishing.current) return;
    const t = Math.round(performance.now() - o);
    if (t < 0) return; // the countdown: dropped
    advance(g, t);
    if (g.ended) return; // never record a key once the run is over (R7)
    for (const key of keysOf(g)) {
      press(g, key, t);
      entries.current.push({ key, t, insert });
    }
    syncHud();
  }, [syncHud]);

  const onKeys = useCallback((keys: string[], insert: boolean) => apply(() => keys, insert), [apply]);
  /** A word-delete clears the locked word's typed letters (at least one backspace, as a plain one would). */
  const onWordBack = useCallback(
    () => apply((g) => Array.from({ length: Math.max(1, lockedOf(g)?.typed ?? 0) }, () => "\b"), false),
    [apply],
  );

  // ---- Focus: a stray letter typed elsewhere, or leaving fullscreen, puts it back. ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 && !(input.current?.focused() ?? true)) input.current?.focus();
    };
    const refocus = () => input.current?.focus();
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", refocus);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", refocus);
    };
  }, []);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const [vh, vtop] = viewport ? viewport.split(":").map(Number) : [null, 0];
  const playing = stage.kind === "run" || stage.kind === "sending";
  const showScene = gl && sceneLoaded && !sceneFailed;
  const quality = qualityOf({ reducedMotion, slow, coarse: false });

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal
      aria-label="Slime game"
      className={`${qualifierFont.variable} fixed inset-0 z-[100] h-dvh touch-manipulation select-none overflow-hidden overscroll-none text-foreground`}
      style={{ background: css(SKY), ...(vh ? { height: vh, top: vtop } : null) }}
      // Taps never take the focus from the typing box (a button still gets its click) ...
      onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button")) e.preventDefault(); }}
      // ... and any tap puts it back, and lets the sound start (browsers need a gesture for it).
      onClick={() => { primeSound(); input.current?.focus(); }}
    >
      {showScene && (
        <SlimeScene
          game={game}
          clock={() => (origin.current === null ? 0 : performance.now() - origin.current)}
          quality={quality}
          lockId={lockId}
          live={playing}
          onEvent={onEvent}
          onHit={onHit}
          onSlow={onSlow}
          onFail={onSceneFail}
        />
      )}
      <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 opacity-0"
        style={{ background: `radial-gradient(circle at 50% 55%, transparent 30%, ${css(SLIMES[0], 0.9)} 100%)` }} />

      {gl && <GameInput ref={input} onKeys={onKeys} onWordBack={onWordBack} />}

      {playing && <GameHud hud={hud} muted={muted} onMute={toggleMute} />}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center font-game">
        {stage.kind === "run" && count > 0 && (
          <p key={count} className="rounded-3xl bg-background/80 px-8 py-4 text-7xl leading-none tabular-nums shadow-sm backdrop-blur-sm" aria-live="assertive">
            {count}
          </p>
        )}
        {stage.kind === "starting" && <Notice>Getting ready…</Notice>}
        {playing && sceneFailed && <Notice>{SCENE_FAILED}</Notice>}
        {stage.kind === "sending" && (
          <Notice>
            {stage.offline
              ? "Couldn't reach the server. Your run is saved on this device and will be sent again."
              : "Sending your run…"}
            {stage.offline && <Leave onExit={onExit} label="Leave for now" />}
          </Notice>
        )}
        {stage.kind === "nogl" && (
          <Notice>
            {NO_GL}
            <Leave onExit={onExit} label="Back" />
          </Notice>
        )}
        {stage.kind === "failed" && (
          <Notice>
            {stage.message}
            <span className="flex justify-center gap-2">
              <Button type="button" variant="outline" className="pointer-events-auto" onClick={onExit}>Back</Button>
              <Button type="button" className="pointer-events-auto" onClick={() => void begin()}>Try again</Button>
            </span>
          </Notice>
        )}
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-sm flex-col gap-3 rounded-2xl bg-background/85 px-5 py-4 font-sans text-base text-foreground shadow-sm backdrop-blur-sm" role="status">
      {children}
    </div>
  );
}

function Leave({ onExit, label }: { onExit: () => void; label: string }) {
  return (
    <Button type="button" variant="outline" className="pointer-events-auto self-center" onClick={onExit}>{label}</Button>
  );
}
