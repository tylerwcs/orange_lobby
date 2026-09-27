"use client";
import { useState, useTransition } from "react";
import type { HostState } from "@/lib/games/wire";
import { canReveal, type Phase, type StageRow } from "@/lib/games/phase";
import { GAME_KIND_LABELS } from "@/lib/games/config";
import { HOST_INTERVAL } from "@/lib/games/poll";
import { isOver } from "@/lib/games/survival";
import { OPTION_STYLES, type PublicStage } from "@/lib/games/views";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";
import {
  drawAction, finishAction, idleAction, nextAction, openGameAction, presentAction, redrawAction,
  revealAction, startAction, stopAction, type HostResult,
} from "@/app/host/[token]/actions";

const every = () => HOST_INTERVAL;
const big = "h-14 w-full text-base font-bold";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Nothing on stage",
  race_lobby: "Lobby — players joining",
  race_countdown: "Countdown",
  race_live: "Racing",
  race_results: "Results",
  survival_lobby: "Lobby — players joining",
  survival_question: "Question open",
  survival_locked: "Time's up",
  survival_reveal: "Answer revealed",
  survival_over: "Game over",
  draw_ready: "Ready to draw",
  draw_spinning: "Drawing…",
  draw_reveal: "Winner on screen",
};

/** Phases whose on-screen time moves: the console's clock ticks only in these. */
const TICKING: ReadonlySet<Phase> = new Set<Phase>(["race_countdown", "race_live", "survival_question", "survival_locked"]);

/**
 * The public stage as the phase rules read it, so the Reveal button asks `canReveal` exactly
 * what the reveal action asks. All it needs is the phase and the question's deadline.
 */
function ruleStage(s: PublicStage, version: number): StageRow {
  const deadline = s.question?.deadline ?? null;
  return {
    event_id: "", run_id: null, game_id: s.game?.id ?? null, phase: s.phase, version,
    phase_data: s.question && deadline !== null ? { question: s.question.no, deadline: new Date(deadline).toISOString() } : {},
    phase_ends_at: s.endsAt === null ? null : new Date(s.endsAt).toISOString(),
  };
}

/**
 * The stage, run from a phone (D251). One big button for the next step, a two-tap "End game",
 * and the facts the host needs to talk over it. Every action carries the version this console
 * was showing, so two consoles cannot skip a step (D261); a refusal says so and the console
 * catches up on the next poll, which it asks for at once.
 */
export function HostConsole({ token, initial }: { token: string; initial: HostState }) {
  const { state, offset, pollNow } = usePoll<HostState>(`/api/host/${token}/state`, initial, every, false);
  const s = state.stage;
  // Server time (D257); in survival_locked it ticks so Reveal wakes up when the grace ends.
  const now = useServerNow(offset, 250, TICKING.has(s.phase));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const v = state.version;
  const revealReady = canReveal(ruleStage(s, v), now);

  const run = (fn: () => Promise<HostResult>) => startTransition(async () => {
    let r: HostResult;
    try {
      r = await fn();
    } catch {
      r = { ok: false, message: "That didn't reach the server. Check the connection and try again." };
    }
    startTransition(() => {
      setMessage(r.message ?? null);
      setArmed(null);
    });
    pollNow();
  });
  const confirmTwice = (id: string, fn: () => Promise<HostResult>) => (armed === id ? run(fn) : setArmed(id));
  const secondsLeft = (until: number | null) => (until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <header className="flex flex-col gap-0.5">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{state.event.name} · Host</p>
        <h1 className="text-xl font-extrabold leading-tight">{s.game?.title ?? "Games"}</h1>
        <p className="text-sm text-muted-foreground">{s.game ? `${GAME_KIND_LABELS[s.game.kind]} · ` : ""}{PHASE_LABEL[s.phase]}</p>
      </header>

      {message && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{message}</p>}

      <section className="flex flex-col gap-3">
        {/* Tap race */}
        {s.phase === "race_lobby" && (
          <>
            <Facts rows={state.race?.lanes.map((l) => [l.label, `${l.players} joined`]) ?? []} empty="Waiting for players to join…" />
            <Button className={big} disabled={pending} onClick={() => run(() => startAction(token, v))}>Start race</Button>
          </>
        )}
        {(s.phase === "race_countdown" || s.phase === "race_live") && (
          <>
            {/* Server-rendered a moment before the client hydrates, so the seconds may differ by one. */}
            <p className="text-center text-5xl font-extrabold tabular-nums" suppressHydrationWarning>
              {s.phase === "race_countdown" ? secondsLeft(s.race?.liveFrom ?? null) : `${secondsLeft(s.race?.liveUntil ?? null)}s`}
            </p>
            <Facts rows={state.race?.lanes.slice(0, 5).map((l) => [`${l.place}. ${l.label}`, String(l.score)]) ?? []} />
            <Button className={big} variant="destructive" disabled={pending} onClick={() => run(() => stopAction(token, v))}>Stop race</Button>
          </>
        )}
        {s.phase === "race_results" && (
          <>
            <Facts rows={state.race?.lanes.slice(0, 3).map((l) => [`${l.place}. ${l.label}`, String(l.score)]) ?? []} />
            {state.race?.mvp && <p className="text-sm">Fastest tapper: <b>{state.race.mvp.name}</b> ({state.race.mvp.taps})</p>}
            {s.game && <Button className={big} disabled={pending} onClick={() => run(() => openGameAction(token, v, s.game!.id, state.grouping))}>Run again</Button>}
          </>
        )}

        {/* Last one standing */}
        {s.phase === "survival_lobby" && (
          <>
            <p className="text-center text-5xl font-extrabold tabular-nums">{state.survival?.players.length ?? 0}<span className="block text-sm font-normal text-muted-foreground">joined</span></p>
            <Button className={big} disabled={pending} onClick={() => run(() => startAction(token, v))}>Start question 1</Button>
          </>
        )}
        {(s.phase === "survival_question" || s.phase === "survival_locked") && s.question && (
          <>
            <p className="text-sm font-bold">Question {s.question.no + 1} of {s.question.total}</p>
            <p className="text-lg font-bold">{s.question.text}</p>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              {state.survival?.answered ?? 0} of {state.survival?.players.length ?? 0} answered
              {s.phase === "survival_question" ? ` · ${secondsLeft(s.question.deadline)}s left` : ""}
            </p>
            {s.phase === "survival_locked" && state.survival?.split && (
              <Facts rows={s.question.options.map((o, i) => [`${OPTION_STYLES[i].letter}. ${o}`, String(state.survival!.split![i] ?? 0)])} />
            )}
            {/* Answers sent just before the whistle still count for a moment (D272); the reveal waits for them. */}
            {s.phase === "survival_locked" && (
              <Button className={big} disabled={pending || !revealReady} onClick={() => run(() => revealAction(token, v))} suppressHydrationWarning>
                {revealReady ? "Reveal answer" : "Waiting for last answers…"}
              </Button>
            )}
          </>
        )}
        {s.phase === "survival_reveal" && s.question && s.reveal && (
          <>
            <p className="text-center text-lg font-bold">
              {s.reveal.everyoneSurvived ? "Everyone was wrong — everyone survives!" : `−${s.reveal.eliminated} · ${s.reveal.remaining} remain`}
            </p>
            {isOver(s.reveal.remaining, s.question.no, s.question.total)
              ? <Button className={big} disabled={pending} onClick={() => run(() => finishAction(token, v))}>Show the winner</Button>
              : <Button className={big} disabled={pending} onClick={() => run(() => nextAction(token, v))}>Next question ({s.question.no + 2} of {s.question.total})</Button>}
          </>
        )}
        {s.phase === "survival_over" && (
          <>
            <Facts rows={state.survival?.winners.map((w) => [w.name, w.company]) ?? []} empty="No winner." />
            {s.game && <Button className={big} disabled={pending} onClick={() => run(() => openGameAction(token, v, s.game!.id, null))}>Play again</Button>}
          </>
        )}

        {/* Lucky draw */}
        {s.phase === "draw_ready" && state.hostDraw && (
          <>
            <Facts rows={state.hostDraw.progress.map((p) => [p.name, `${p.given}/${p.quantity}`])} />
            <p className="text-sm text-muted-foreground">{state.draw?.pool ?? 0} eligible</p>
            <DrawButtons state={state} pending={pending}
              onDraw={(mode) => run(() => drawAction(token, v, mode))} />
          </>
        )}
        {(s.phase === "draw_spinning" || s.phase === "draw_reveal") && state.hostDraw && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {s.phase === "draw_spinning" ? "Drawn — the screen is still rolling" : "On screen now"}
            </p>
            <ul className="flex flex-col gap-2">
              {state.hostDraw.spinWinners.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                  <span className="min-w-0 flex-1"><b className="block truncate">{w.name}</b><span className="text-xs text-muted-foreground">{w.company}</span></span>
                  {s.phase === "draw_reveal" && (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => confirmTwice(`redraw:${w.id}`, () => redrawAction(token, v, w.id))}>
                      {armed === `redraw:${w.id}` ? "Tap again" : "Not here"}
                    </Button>
                  )}
                </li>
              ))}
              {state.hostDraw.spinWinners.length === 0 && <li className="text-sm text-muted-foreground">No one left to draw.</li>}
            </ul>
            {s.phase === "draw_reveal" && <Button className={big} disabled={pending} onClick={() => run(() => presentAction(token, v))}>✓ Present — next prize</Button>}
          </>
        )}
      </section>

      {state.actions.includes("open") && <GamePicker state={state} pending={pending} onOpen={(id, grouping) => run(() => openGameAction(token, v, id, grouping))} />}

      {state.actions.includes("idle") && (
        <Button variant="ghost" className="mt-auto" disabled={pending} onClick={() => confirmTwice("idle", () => idleAction(token, v))}>
          {armed === "idle" ? "Tap again to end the game" : "End game"}
        </Button>
      )}
    </main>
  );
}

function Facts({ rows, empty }: { rows: string[][]; empty?: string }) {
  if (rows.length === 0) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <dl className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
      {rows.map(([k, val], i) => (
        <div key={i} className="flex justify-between gap-3 px-3 py-2"><dt className="truncate">{k}</dt><dd className="shrink-0 font-bold tabular-nums">{val}</dd></div>
      ))}
    </dl>
  );
}

/** The next prize in the admin's order (D279): one at a time, or all that is left of it. */
function DrawButtons({ state, pending, onDraw }: { state: HostState; pending: boolean; onDraw: (mode: "one" | "all") => void }) {
  const next = state.hostDraw?.progress.find((p) => p.remaining > 0);
  if (!next) return <p className="text-sm font-bold">Every prize has been drawn.</p>;
  return (
    <>
      <Button className={big} disabled={pending} onClick={() => onDraw("one")}>Draw 1 × {next.name}</Button>
      {next.remaining > 1 && (
        <Button className={big} variant="outline" disabled={pending} onClick={() => onDraw("all")}>
          Draw all {next.remaining} remaining
        </Button>
      )}
    </>
  );
}

/** Pick the next game; a race also picks its lanes here (D263). */
function GamePicker({ state, pending, onOpen }: { state: HostState; pending: boolean; onOpen: (id: string, grouping: unknown) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [lanes, setLanes] = useState("solo");
  const game = state.games.find((g) => g.id === picked);
  // "By category" races each attendee under their first category part (laneKeyFor).
  // Field options carry a prefix so a field keyed "solo" or "category" cannot pass for those.
  const fieldKey = lanes.startsWith("field:") ? lanes.slice("field:".length) : null;
  const grouping = fieldKey !== null
    ? { by: "field", key: fieldKey, label: state.fields.find((f) => f.key === fieldKey)?.label ?? fieldKey }
    : lanes === "category" ? { by: "category" } : { by: "solo" };

  if (state.games.length === 0) return <p className="text-sm text-muted-foreground">No games yet. Add them on the Games page in admin.</p>;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Start a game</h2>
      <ul className="flex flex-col gap-2">
        {state.games.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => setPicked(g.id)} aria-pressed={picked === g.id}
              className={`flex w-full flex-col rounded-xl border p-3 text-left ${picked === g.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <span className="font-bold">{g.title}</span>
              <span className="text-xs text-muted-foreground">{GAME_KIND_LABELS[g.kind]} · {g.summary}</span>
            </button>
          </li>
        ))}
      </ul>
      {game?.kind === "tap_race" && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          Lanes
          <select value={lanes} onChange={(e) => setLanes(e.target.value)} className="h-11 rounded-md border border-input bg-transparent px-3 text-base">
            <option value="solo">Everyone solo (top 10)</option>
            <option value="category">By category</option>
            {state.fields.map((f) => <option key={f.key} value={`field:${f.key}`}>By {f.label}</option>)}
          </select>
        </label>
      )}
      {game && <Button className={big} disabled={pending} onClick={() => onOpen(game.id, game.kind === "tap_race" ? grouping : null)}>Open {game.title}</Button>}
    </section>
  );
}
