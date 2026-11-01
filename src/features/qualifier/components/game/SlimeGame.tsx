"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { backoff, clockOffset } from "@/lib/poll";
import { qualifierFont } from "../../font";
import { GAME_NAME } from "../../paths";
import type { QualifierView } from "../../view";
import { advance, currentWord, newGame, press, type Game, type GameEvent } from "../../game/engine";
import { perfOrigin } from "../../game/keys";
import { LABEL_INK, SKY, SLIMES, TITLE_INK, css } from "../../game/palette";
import { clearPending, savePending, settle } from "../../game/pending";
import { hasWebGL, qualityOf } from "../../game/quality";
import type { RunResult } from "../../game/replay";
import { multiplier } from "../../game/rules";
import { isMuted, playMusic, primeSound, setMuted, sfx, stopMusic } from "../../game/sound";
import { encodeTimeline, type Entry, type SubmitBody, type SubmitReason } from "../../game/timeline";
import { GameHud, type HudState } from "./GameHud";
import { GameInput, type GameInputHandle } from "./GameInput";
import { drainEvents } from "./sceneEvents";

const loadScene = () => import("./SlimeScene");
const SlimeScene = dynamic(loadScene, { ssr: false });

/** `discard`: the error is a kept run that keeps failing to send, which the player may discard. */
export type StartAnswer = { runId: string; startsAt: string; serverNow: number; seed: number } | { error: string; discard?: boolean };
/** `view` is the qualifier page's refreshed view, with this run on the board. */
export type SubmitAnswer = { ok: true; score: number; prevBest: number | null; view: QualifierView } | { ok: false; reason: SubmitReason };

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
  /** The title screen, the scene still loading. */
  | { kind: "loading" }
  /** The title screen with Start. */
  | { kind: "title" }
  | { kind: "starting" }
  /** `retry`: what Try again does (load the scene again, or start a run). */
  | { kind: "failed"; message: string; discard?: boolean; retry: "load" | "start" }
  | { kind: "run"; origin: number }
  | { kind: "sending"; offline: boolean; tries: number };

/** The game's name, on its title screen. */
export const GAME_TITLE = `${GAME_NAME}!`;
const NO_GL = "This game needs a browser with 3D graphics turned on.";
/** A mid-run failure of the scene (R12): the run plays on without it. */
const SCENE_FAILED = "The 3D view stopped working. Your run finishes on its own.";
const SCENE_LOAD_FAILED = "Couldn't load the game.";
/** How long the scene's chunk may take before the start gives up (a run never starts without it). */
const SCENE_TIMEOUT_MS = 20_000;
/** Failed sends after which the player may leave whatever the reason (the run stays kept). */
const LEAVE_AFTER_TRIES = 3;
const START_ERROR = "Couldn't start a run. Check your connection and try again.";
/** The server said the run can't have ended yet (this phone's clock ran ahead): ask again soon. */
const EARLY_RETRY_MS = 2000;

const EMPTY_HUD: HudState = { score: 0, combo: 0, health: 0, word: null, typed: 0, miss: null, misses: 0 };
/** How long a wrong key stays shown in red in the typing bar, unless a next key clears it first. */
const MISS_MS = 800;

/** The last wrong key, shown in the typing bar until MISS_MS pass or the next key; `n` counts them. */
type Miss = { letter: string; at: number; n: number };

const lockedOf = (g: Game) => (g.lock === null ? undefined : g.slimes.find((s) => s.id === g.lock));

function hudOf(g: Game, miss: Miss | null, misses: number): HudState {
  const s = lockedOf(g);
  return {
    score: g.score, combo: g.combo, health: g.health, word: s ? currentWord(s) : null, typed: s ? s.typed : 0,
    miss: miss ? miss.letter : null, misses,
  };
}

const sameHud = (a: HudState, b: HudState) =>
  a.score === b.score && a.combo === b.combo && a.health === b.health && a.word === b.word && a.typed === b.typed &&
  a.miss === b.miss && a.misses === b.misses;

/** 3-2-1 before the start (clamped, so a start that arrives late or early still reads sensibly), 0 after. */
const countOf = (t: number) => (t >= 0 ? 0 : Math.min(3, Math.max(1, Math.ceil(-t / 1000))));

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** `p`, or a rejection once `ms` have passed. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
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
 * One slime run (D794), as a full-screen overlay over the portal: the title screen, loading the
 * scene → Start → 3-2-1 → play until the engine ends the run → submit the keystroke timeline →
 * `onDone`.
 *
 * - **Title and scene first.** The overlay opens on the game's title, its loading animated, and
 *   offers Start (or Enter) once the scene's chunk and the slime model (both prefetched by the
 *   ready screen) have loaded, up to SCENE_TIMEOUT_MS: a run never starts without them, and the
 *   server's run only starts on Start. If they can't load: "Couldn't load the game.", Back /
 *   Try again. Every wait (loading, getting ready, sending) is animated, so it never looks stuck.
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
 * - **Screen.** `fixed inset-0 z-[100]` in the sky's colour, the body scroll locked while open:
 *   the whole window is always covered. Inside it the game follows `visualViewport` (its top and
 *   height), so on a phone the scene sits above the keyboard. iPhone Safari reports that box late
 *   and in steps while its keyboard and floating bars move; with the cover the gap is sky for a
 *   frame, never the portal behind (sizing the overlay itself to it let the page show through,
 *   D797). Fullscreen is the parent's
 *   (it must be asked inside the Play click, on `ref`); a refusal or Esc leaves the overlay filling
 *   the window and the run carries on. Removing the overlay ends fullscreen (the browser exits it
 *   when the fullscreen element leaves the page).
 * - **Input.** One always-focused native box (`GameInput`); any tap on the overlay, a stray
 *   letter typed elsewhere or leaving fullscreen puts the focus back.
 *
 * No pause: a hidden tab stops the frames, and the engine catches up on the next one.
 */
export function SlimeGame({ token, start, submit, onDone, onExit, ref }: SlimeGameProps) {
  const [stage, setStage] = useState<Stage>(() => (hasWebGL() ? { kind: "loading" } : { kind: "nogl" }));
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
  const startingRun = useRef(false);
  const finishing = useRef(false);
  const alive = useRef(true);
  const lastHud = useRef<HudState>(EMPTY_HUD);
  const miss = useRef<Miss | null>(null);
  /** The multiplier last heard, for the combo sparkle. */
  const shownMult = useRef(1);
  const misses = useRef(0);
  const latest = useRef({ token, start, submit, onDone });
  useEffect(() => { latest.current = { token, start, submit, onDone }; }, [token, start, submit, onDone]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => lockBodyScroll(), []);

  // The music: the title tune from the title screen, the run's from Start; none once it closes.
  const musicMood = stage.kind === "loading" || stage.kind === "title" ? "title" : stage.kind === "run" ? "play" : null;
  useEffect(() => {
    if (musicMood) playMusic(musicMood);
  }, [musicMood]);
  useEffect(() => stopMusic, []);

  // ---- Sound, the music's mood and the goo flash, from the engine's events (whoever drains them). ----
  const onEvent = useCallback((e: GameEvent) => {
    if (e.type === "boss") {
      if (e.id !== undefined) bossIds.current.add(e.id);
      sfx("boss");
      playMusic("boss");
    } else if (e.type === "pop") {
      if (e.id !== undefined && bossIds.current.has(e.id)) {
        sfx("splat");
        sfx("bossDown");
        playMusic("play");
      } else {
        sfx("pop");
      }
    } else if (e.type === "word") sfx("pop");
    else if (e.type === "letter") sfx("type");
    else if (e.type === "stick") sfx("bite");
    else if (e.type === "explode") sfx("hit");
    else if (e.type === "wrong") sfx("wrong");
    // The multiplier went up: a sparkle.
    const m = multiplier(game.current?.combo ?? 0);
    if (m > shownMult.current && (e.type === "pop" || e.type === "word")) sfx("combo");
    shownMult.current = m;
  }, []);
  const onHit = useCallback(() => {
    flash.current?.animate?.([{ opacity: 0.9 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
  }, []);
  const handlers = useRef({ onEvent, onHit });

  const syncHud = useCallback(() => {
    const g = game.current;
    if (!g) return;
    if (miss.current && performance.now() - miss.current.at > MISS_MS) miss.current = null;
    const next = hudOf(g, miss.current, misses.current);
    if (!sameHud(next, lastHud.current)) {
      lastHud.current = next;
      setHud(next);
    }
    setLockId(g.lock);
  }, []);

  // ---- The scene: loaded before the start (begin), unmounted for good if it fails mid-run. ----
  const gl = stage.kind !== "nogl";

  const onSceneFail = useCallback(() => {
    sceneDrains.current = false; // from now on the loop drains (R11)
    setSceneFailed(true);
  }, []);
  const onSlow = useCallback(() => setSlow(true), []);

  // ---- The scene's chunk and the model: true once loaded (and drawing behind the title). ----
  const loadScene3d = useCallback(async (): Promise<boolean> => {
    try {
      await within(loadScene().then((m) => m.loadSlimeModel()), SCENE_TIMEOUT_MS);
    } catch {
      if (alive.current) setStage({ kind: "failed", message: SCENE_LOAD_FAILED, retry: "load" });
      return false;
    }
    if (!alive.current) return false;
    sceneDrains.current = true;
    setSceneLoaded(true);
    return true;
  }, []);

  const load = useCallback(async () => {
    setStage({ kind: "loading" });
    if (await loadScene3d()) setStage({ kind: "title" });
  }, [loadScene3d]);

  // ---- The server's run, then the countdown. ----
  const startRun = useCallback(async () => {
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
      setStage({ kind: "failed", message: answer.error || START_ERROR, discard: answer.discard, retry: "start" });
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
    shownMult.current = 1;
    miss.current = null;
    misses.current = 0;
    lastHud.current = hudOf(g, null, 0);
    setHud(lastHud.current);
    setCount(countOf(Math.round(performance.now() - o)));
    setStage({ kind: "run", origin: o });
  }, []);

  // ---- Start: the scene (loaded already, from the title), then the run. ----
  const begin = useCallback(async () => {
    if (startingRun.current) return; // a double tap on Start or Try again starts one run
    startingRun.current = true;
    try {
      setStage({ kind: "starting" });
      if (!(await loadScene3d())) return;
      await startRun();
    } finally {
      startingRun.current = false;
    }
  }, [loadScene3d, startRun]);

  useEffect(() => {
    // Once per mount (a StrictMode re-run loads once).
    if (started.current || stage.kind !== "loading") return;
    started.current = true;
    void load();
  }, [stage.kind, load]);

  // Enter starts from the title screen, as on the ready screen (a held key's repeats don't).
  const onTitle = stage.kind === "title";
  useEffect(() => {
    if (!onTitle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing) return;
      e.preventDefault();
      void begin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTitle, begin]);

  // ---- Submit, until a final answer (or the player leaves). ----
  const finishRun = useCallback(async () => {
    const g = game.current;
    if (!g || finishing.current) return;
    finishing.current = true;
    stopMusic();
    sfx("gameover");
    const local: RunResult = { score: g.score, endedMs: g.endedMs ?? g.nowMs, popped: g.popped, bosses: g.bosses };
    const body: SubmitBody = { runId: runId.current, device: input.current?.device() ?? "unknown", ...encodeTimeline(entries.current) };
    const { token: tok } = latest.current;
    const store = storage();
    const savedAt = Date.now();
    let tries = 0;
    savePending(store, tok, { runId: body.runId, body, tries, savedAt });
    setStage({ kind: "sending", offline: false, tries });
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
      savePending(store, tok, { runId: body.runId, body, tries, savedAt });
      if (!alive.current) return;
      setStage({ kind: "sending", offline: said === "network", tries });
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
        if (c > 0) sfx("count");
        else if (shown > 0) sfx("go");
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
      const before = g.events.length;
      press(g, key, t);
      entries.current.push({ key, t, insert });
      // The typing bar shows a wrong key in red; a right key or a backspace clears it.
      if (key !== "\b" && g.events.slice(before).some((e) => e.type === "wrong")) {
        misses.current += 1;
        miss.current = { letter: key, at: performance.now(), n: misses.current };
      } else {
        miss.current = null;
      }
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
    input.current?.focus(); // the typing box keeps the focus (GameHud's button never takes it)
  };

  /** The kept run that won't send is given up, and a new run starts. */
  const discardAndPlay = () => {
    clearPending(storage(), latest.current.token);
    void begin();
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
      className={`${qualifierFont.variable} fixed inset-0 z-[100] touch-manipulation select-none overflow-hidden overscroll-none text-foreground`}
      style={{ background: css(SKY) }}
      // Taps never take the focus from the typing box (a button still gets its click) ...
      onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button")) e.preventDefault(); }}
      // ... and any tap puts it back, and lets the sound start (browsers need a gesture for it).
      onClick={() => { primeSound(); input.current?.focus(); }}
    >
      {/* The game itself, in the part of the screen the player can see: above a phone's keyboard. */}
      <div className="absolute inset-x-0 overflow-hidden" style={vh ? { top: vtop, height: vh } : { top: 0, bottom: 0 }}>
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
          {(stage.kind === "loading" || stage.kind === "title") && (
            <Title loading={stage.kind === "loading"} onStart={() => void begin()} onExit={onExit} />
          )}
          {stage.kind === "starting" && <Notice><Loader label="Getting ready…" /></Notice>}
          {playing && sceneFailed && <Notice>{SCENE_FAILED}</Notice>}
          {stage.kind === "sending" && (
            <Notice>
              {stage.offline
                ? "Couldn't reach the server. Your run is saved on this device and will be sent again."
                : <Loader label="Sending your run…" />}
              {(stage.offline || stage.tries >= LEAVE_AFTER_TRIES) && <Leave onExit={onExit} label="Leave for now" />}
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
                <Button type="button" className="pointer-events-auto" onClick={() => void (stage.retry === "load" ? load() : begin())}>Try again</Button>
              </span>
              {stage.discard && <Leave onExit={discardAndPlay} label="Discard it and play" />}
            </Notice>
          )}
        </div>
      </div>
    </div>
  );
}

/** The title screen: the game's name over the meadow, and Start once the scene has loaded. */
function Title({ loading, onStart, onExit }: { loading: boolean; onStart: () => void; onExit: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-500">
      <h1 className="font-game text-6xl leading-none tracking-tight sm:text-8xl"
        style={{
          color: css(TITLE_INK), WebkitTextStroke: `4px ${css(LABEL_INK)}`, paintOrder: "stroke fill",
          textShadow: `0 5px 0 ${css(SLIMES[2])}, 0 10px 0 ${css(SLIMES[1])}, 0 16px 24px ${css(LABEL_INK, 0.3)}`,
        }}>
        {GAME_TITLE}
      </h1>
      <p className="max-w-xs rounded-2xl bg-background/85 px-4 py-2 font-sans text-base text-foreground shadow-sm backdrop-blur-sm">
        Type a slime&apos;s word to pop it before it bites. Three bites and you&apos;re out.
      </p>
      {loading ? (
        <div className="rounded-2xl bg-background/85 px-6 py-4 shadow-sm backdrop-blur-sm">
          <Loader label="Loading the meadow…" />
        </div>
      ) : (
        <span className="flex flex-col items-center gap-1.5">
          <Button type="button" onClick={onStart}
            className="h-16 rounded-full px-14 font-game text-3xl shadow-lg motion-safe:animate-pulse">
            Start
          </Button>
          <span className="hidden font-sans text-sm text-foreground/70 pointer-fine:block">or press Enter</span>
        </span>
      )}
      <Button type="button" variant="ghost" className="bg-background/60" onClick={onExit}>Back</Button>
    </div>
  );
}

/** Four slimes bouncing in turn over a label: every wait in the game shows it, so none looks stuck. */
function Loader({ label }: { label: string }) {
  return (
    <span className="flex flex-col items-center gap-3" role="status">
      <span className="flex h-8 items-end gap-2" aria-hidden>
        {SLIMES.slice(0, 4).map((c, i) => (
          <span key={c} className="size-5 rounded-t-full rounded-b-md motion-safe:animate-bounce"
            style={{ background: css(c), animationDelay: `${i * 140}ms` }} />
        ))}
      </span>
      <span className="font-sans text-base text-foreground">{label}</span>
    </span>
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
