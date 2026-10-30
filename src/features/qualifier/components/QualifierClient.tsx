"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { clockOffset } from "@/lib/poll";
import { useServerNow } from "@/lib/use-poll";
import { shortDateTime } from "@/lib/text";
import { markSeenAction } from "@/app/e/[slug]/(portal)/a/[token]/qualifier/actions";
import type { QualifierView } from "../view";
import { backspace, ghostIndexAt, initialTyping, prefixOf, typeText, type TypingState } from "../typing";
import { GRACE_MS, RUN_MS } from "../scoring";
import { liveWpm, perfOrigin, runClock, submissionOf } from "../run";
import { claimFree, failMessage, gapLine, livePhase, untilText, type FailReason } from "../screen";
import { qualifierFont } from "../font";
import { TypingInput, type TypingInputHandle } from "./TypingInput";
import { RunHud } from "./RunHud";
import { Tunnel, preloadTunnel3D } from "./Tunnel";
import { ResultCard } from "./ResultCard";
import { Board } from "./Board";

type Ghosts = { best: number[] | null; cut: number[] | null };
type Run = { runId: string; words: string[]; origin: number; ghosts: Ghosts };
type Landed = { wpm: number; accuracy: number; line: string };
type Stage =
  | { kind: "ready"; error: string | null }
  | { kind: "run"; run: Run } // the countdown and the sprint, told apart by the clock
  | { kind: "landing"; run: Run } // the submit is in flight
  | { kind: "result"; landed: Landed }
  | { kind: "failed"; message: string };

const START_ERROR = "Could not start. Check the connection and try again.";
const LOST = "We couldn't reach the server — that run may not have counted";
const MAYBE_COUNTED = "That run may already have counted — reload to see the board";
const SWIPE = "Type letter by letter — swipe typing may be disqualified";
/** Clock ticks during a run: the HUD's seconds, the ghosts, and the end of the sprint. */
const TICK_MS = 100;
/** A key held from the sprint must not fly again the moment the result shows. */
const ENTER_GUARD_MS = 400;
/** The server judged the run early (this phone's clock is ahead): ask once more after this. */
const EARLY_RETRY_MS = 1500;
const NET_RETRY_MS = 600;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SubmitAnswer =
  | { ok: true; wpm: number; accuracy: number; line: string; view: QualifierView }
  | { ok: false; reason: FailReason }
  | { message: string };

/**
 * Sends a finished run (D771's submit). A dropped connection is tried again while the run can
 * still count (`deadline`, on the performance clock); a run judged early once more after a pause.
 * After a retry, "done" may be this very run counted by the attempt whose answer was lost.
 */
async function submitRun(token: string, body: string, deadline: number): Promise<SubmitAnswer> {
  let retried = false;
  let earlyRetried = false;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(`/api/qualifier/${token}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true,
      });
    } catch {
      if (performance.now() + NET_RETRY_MS < deadline) {
        retried = true;
        await wait(NET_RETRY_MS);
        continue;
      }
      return { message: LOST };
    }
    const json = (await res.json().catch(() => null)) as (SubmitAnswer & { error?: string }) | null;
    if (!res.ok || !json || !("ok" in json)) return { message: json?.error ?? failMessage("refused") };
    if (json.ok) return json;
    if (json.reason === "early" && !earlyRetried) {
      earlyRetried = true;
      await wait(EARLY_RETRY_MS);
      continue;
    }
    if (json.reason === "done" && retried) return { message: MAYBE_COUNTED };
    return json;
  }
}

/**
 * The typing qualifier on the attendee's phone or laptop (D772): ready → countdown → 30-second
 * sprint → result, and the board. The server owns the run (D771): it hands out the words and the
 * start time, and judges the result; this page only times the words against that start, on the
 * `performance.now()` clock aligned to the server's (D257).
 *
 * One typing box stays mounted from the ready screen to the result, so a phone's keyboard opens
 * on the Fly tap (iOS opens it only inside a tap) and stays up for "Fly again". During the run it
 * lies invisibly over the run card, so a tap anywhere on the card puts the focus back.
 */
export function QualifierClient({ token, slug, initial }: { token: string; slug: string; initial: QualifierView }) {
  const [view, setView] = useState(initial);
  const [stage, setStage] = useState<Stage>({ kind: "ready", error: null });
  const [starting, setStarting] = useState(false);
  const [typing, setTyping] = useState<TypingState>(initialTyping);
  const [t, setT] = useState(0);
  const [offset, setOffset] = useState(0);
  const [swipe, setSwipe] = useState(false);
  const input = useRef<TypingInputHandle>(null);
  const area = useRef<HTMLDivElement>(null);
  // Read by the typing handlers, which must see a keystroke's effect before React renders it.
  const typingRef = useRef<TypingState>(initialTyping);
  const runRef = useRef<Run | null>(null);
  const busy = useRef(false);
  const swipeShown = useRef(false);
  const resultAt = useRef(0);
  const seen = useRef(false);

  const running = stage.kind === "run" || stage.kind === "landing";
  const now = useServerNow(offset, 1000, !running);
  const phase = livePhase(view.phase, view.opensAt, view.closesAt, now);

  // The page has shown the player where they stand: that is the next "you dropped" baseline.
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    markSeenAction(slug, token).catch(() => {});
  }, [slug, token]);

  const fly = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    input.current?.focus(); // inside the tap or key press, so a phone opens its keyboard
    setStarting(true);
    setSwipe(false);
    const sent = Date.now();
    try {
      const res = await fetch(`/api/qualifier/${token}/start`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { runId?: string; startsAt: string; serverNow: number; words: string[]; ghosts?: Ghosts; error?: string }
        | null;
      const received = Date.now();
      if (!res.ok || !body || typeof body.runId !== "string") {
        setStage({ kind: "ready", error: body?.error ?? START_ERROR });
        return;
      }
      const off = clockOffset(sent, received, body.serverNow);
      const origin = perfOrigin(Date.parse(body.startsAt), off, Date.now(), performance.now());
      const run: Run = { runId: body.runId, words: body.words, origin, ghosts: body.ghosts ?? { best: null, cut: null } };
      typingRef.current = initialTyping;
      runRef.current = run;
      setTyping(initialTyping);
      setOffset(off);
      setT(performance.now() - origin);
      setStage({ kind: "run", run });
    } catch {
      setStage({ kind: "ready", error: START_ERROR });
    } finally {
      busy.current = false;
      setStarting(false);
    }
  }, [token]);

  const land = useCallback(async (run: Run) => {
    if (runRef.current !== run) return;
    runRef.current = null;
    setStage({ kind: "landing", run });
    const device = input.current?.device() ?? "unknown";
    const body = JSON.stringify({ runId: run.runId, ...submissionOf(typingRef.current, run.words, device) });
    const answer = await submitRun(token, body, run.origin + RUN_MS + GRACE_MS);
    if ("message" in answer) {
      setStage({ kind: "failed", message: answer.message });
    } else if (answer.ok) {
      setView(answer.view);
      resultAt.current = performance.now();
      setStage({ kind: "result", landed: { wpm: answer.wpm, accuracy: answer.accuracy, line: answer.line } });
    } else {
      setStage({ kind: "failed", message: failMessage(answer.reason) });
    }
  }, [token]);

  const onText = useCallback((text: string, tMs: number) => {
    const run = runRef.current;
    if (!run || tMs <= 0 || tMs > RUN_MS) return; // the countdown, or after the bell
    const next = typeText(typingRef.current, run.words, text, tMs);
    typingRef.current = next;
    setTyping(next);
    if (next.multiInserts > 0 && !swipeShown.current) {
      swipeShown.current = true;
      setSwipe(true);
    }
  }, []);

  const onBackspace = useCallback(() => {
    const run = runRef.current;
    if (!run || performance.now() - run.origin > RUN_MS) return;
    const next = backspace(typingRef.current);
    if (next === typingRef.current) return;
    typingRef.current = next;
    setTyping(next);
  }, []);

  // The run's clock: the 3-2-1, the seconds left, then the submit at 30 s.
  useEffect(() => {
    if (stage.kind !== "run") return;
    const run = stage.run;
    let count = 0;
    const id = setInterval(() => {
      const tt = performance.now() - run.origin;
      setT(tt);
      const c = runClock(tt);
      if (c.stage === "countdown" && c.count === 1 && count !== 1) input.current?.focus();
      count = c.count;
      if (c.stage === "over") {
        clearInterval(id);
        void land(run);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [stage, land]);

  // During a run the card is kept in view and the page doesn't scroll under the keyboard.
  useEffect(() => {
    if (!running) return;
    const keep = () => area.current?.scrollIntoView({ block: "start" });
    keep();
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    window.visualViewport?.addEventListener("resize", keep);
    return () => {
      html.style.overflow = before;
      window.visualViewport?.removeEventListener("resize", keep);
    };
  }, [running]);

  // Enter flies (again); during a run it does nothing, and a stray letter refocuses the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const ours = input.current?.focused() ?? false;
      if (running) {
        if (e.key === "Enter") e.preventDefault();
        else if (!ours && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.current?.focus();
        return;
      }
      if (e.key !== "Enter" || phase !== "open") return;
      const el = e.target as HTMLElement | null;
      // Another field's or a button's own Enter (a focused Fly button clicks itself).
      if (!ours && el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName))) return;
      if (stage.kind === "result" && performance.now() - resultAt.current < ENTER_GUARD_MS) return;
      e.preventDefault();
      void fly();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, phase, stage.kind, fly]);

  const canFly = phase === "open";
  const showCockpit = canFly || running || stage.kind === "result" || stage.kind === "failed";
  // The 3D tunnel (D773) is warmed only while the typing box is up and no run is on, in idle time.
  // A run that starts cancels a pending warm-up, so nothing 3D is scheduled during the countdown
  // or the sprint.
  useEffect(() => {
    if (!showCockpit || running) return;
    const warm = () => preloadTunnel3D(false);
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 1500);
    return () => clearTimeout(id);
  }, [showCockpit, running]);
  const flyButton = (label: string) => (
    // mousedown is cancelled so the typing box keeps focus (and a phone its keyboard).
    <Button className="h-16 w-full max-w-xs font-game text-3xl" onMouseDown={(e) => e.preventDefault()} onClick={() => void fly()} disabled={starting}>
      {starting ? "Starting…" : label}
    </Button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`${qualifierFont.variable} flex flex-col gap-6`}>
        {phase === "unset" && (
          <Notice title="Not open yet">The qualifier hasn&apos;t been scheduled. Check back soon.</Notice>
        )}
        {phase === "before" && view.opensAt && (
          <Notice title={`Opens ${shortDateTime(view.opensAt)}`}>
            <span suppressHydrationWarning>in {untilText(Date.parse(view.opensAt) - now)}</span>
          </Notice>
        )}
        {phase === "review" && !running && (
          <Notice title="Results under review — finalists announced soon">
            {view.me.rank !== null && <>You&apos;re #{view.me.rank} of {view.me.total} for now.</>}
          </Notice>
        )}
        {phase === "confirmed" && !running && <Finale view={view} />}

        {showCockpit && (
          <div ref={area} className="relative scroll-mt-2 rounded-3xl bg-card p-4 text-card-foreground shadow-sm" style={{ touchAction: "manipulation" }}>
            <TypingInput ref={input} onText={onText} onBackspace={onBackspace} disabled={stage.kind !== "run"}
              origin={running ? stage.run.origin : 0}
              className={running
                ? "absolute inset-0 z-10 h-full w-full cursor-default rounded-3xl opacity-0"
                : "pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"} />
            {running ? (
              <RunView run={stage.run} t={t} typing={typing} view={view} landing={stage.kind === "landing"} swipe={swipe} />
            ) : stage.kind === "result" ? (
              <div className="flex flex-col items-center gap-3">
                <ResultCard wpm={stage.landed.wpm} accuracy={stage.landed.accuracy} line={claimFree(stage.landed.line, phase)}
                  best={view.me.best} cutWpm={view.cutWpm} canFly={canFly} flying={starting} onFlyAgain={() => void fly()} />
                {swipe && <p role="status" className="text-sm font-bold text-destructive">{SWIPE}</p>}
              </div>
            ) : stage.kind === "failed" ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <p role="alert" className="font-game text-2xl leading-tight">{stage.message}</p>
                {canFly && flyButton("Fly again")}
              </div>
            ) : (
              <Ready view={view} error={stage.error} flyButton={flyButton("Fly")} />
            )}
          </div>
        )}

        {!running && phase !== "unset" && phase !== "before" && <Board view={view} phase={phase} now={now} />}
      </div>
    </MotionConfig>
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

function Ready({ view, error, flyButton }: { view: QualifierView; error: string | null; flyButton: React.ReactNode }) {
  const { best, rank, total, runs } = view.me;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <dl className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Your best</dt>
          <dd className="font-game text-3xl tabular-nums">{best === null ? "—" : best.toFixed(1)}<span className="ml-1 text-sm text-muted-foreground">{best === null ? "" : "wpm"}</span></dd>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Rank</dt>
          <dd className="font-game text-3xl tabular-nums">{rank === null ? "—" : `#${rank}`}<span className="ml-1 text-sm text-muted-foreground">{rank === null ? "" : `of ${total}`}</span></dd>
        </div>
      </dl>
      <p className="font-bold">{gapLine({ best, rank, cutWpm: view.cutWpm })}</p>
      {runs === 0 && (
        <div className="text-sm text-muted-foreground">
          <p>Type each word, then space. A wrong letter must be fixed before you move on.</p>
          <p>30 seconds a flight — fly as often as you like; your best run counts.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {flyButton}
      <p className="hidden text-xs text-muted-foreground pointer-fine:block">or press Enter</p>
    </div>
  );
}

function RunView({ run, t, typing, view, landing, swipe }: {
  run: Run; t: number; typing: TypingState; view: QualifierView; landing: boolean; swipe: boolean;
}) {
  const clock = runClock(t);
  const { words } = run;
  const prefix = prefixOf(typing, words);
  const at = clock.elapsedMs;
  const ghosts = {
    best: run.ghosts.best ? ghostIndexAt(run.ghosts.best, at) : null,
    cut: run.ghosts.cut ? ghostIndexAt(run.ghosts.cut, at) : null,
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <RunHud leftMs={clock.leftMs} wpm={liveWpm(words, typing.index, prefix, at)} />
      <Tunnel progress={typing.index} ghosts={ghosts} skin={view.me.skin} sprint={clock.stage === "sprint"} />
      {clock.stage === "countdown" ? (
        <div className="flex min-h-32 w-full items-center justify-center">
          <motion.span key={clock.count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="font-game text-8xl leading-none tabular-nums" aria-live="assertive">{clock.count}</motion.span>
        </div>
      ) : (
        <WordCard word={words[typing.index] ?? ""} typed={typing.typed} next={words.slice(typing.index + 1, typing.index + 4)} />
      )}
      {landing && <p role="status" className="font-game text-xl">Landing…</p>}
      {swipe && <p role="status" className="text-sm font-bold text-destructive">{SWIPE}</p>}
    </div>
  );
}

/**
 * The word in the gate: right letters green, wrong ones red on a red wash (so it isn't colour
 * alone), the next letter underlined; extra letters past the word's end show in red too.
 */
function WordCard({ word, typed, next }: { word: string; typed: string; next: string[] }) {
  const n = Math.max(word.length, typed.length);
  const letters = [];
  for (let i = 0; i < n; i++) {
    const done = i < typed.length;
    const right = done && typed[i] === word[i];
    const cls = !done
      ? `text-muted-foreground ${i === typed.length ? "underline decoration-primary decoration-4 underline-offset-8" : ""}`
      : right ? "text-emerald-500" : "rounded bg-rose-500/15 text-rose-500";
    letters.push(<span key={i} className={cls}>{i < word.length ? word[i] : typed[i]}</span>);
  }
  return (
    <div className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary/40 bg-background px-3 py-4">
      <p className="sr-only">{word}</p>
      <p aria-hidden className="font-game text-5xl leading-none tracking-wide sm:text-6xl">{letters}</p>
      <p aria-hidden className="text-base text-muted-foreground">{next.join("  ")}</p>
    </div>
  );
}

function Finale({ view }: { view: QualifierView }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-muted p-6 text-center">
      {view.finalist && <p className="font-game text-3xl leading-tight text-primary">You&apos;re through to the finale!</p>}
      <p className="font-game text-xl">
        {view.me.rank === null ? "You're not on the final board" : `Final rank: #${view.me.rank} of ${view.me.total}`}
      </p>
      {!view.finalist && <p className="text-sm text-muted-foreground">The top 10 are through to the finale.</p>}
    </div>
  );
}
