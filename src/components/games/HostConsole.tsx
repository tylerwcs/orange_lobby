"use client";
import { useState, useTransition } from "react";
import type { HostState } from "@/lib/games/wire";
import { canReveal, type Phase, type StageRow } from "@/lib/games/phase";
import { DRAW_FORMAT_LABELS, GAME_KIND_LABELS } from "@/lib/games/config";
import { cardsLeftLabel } from "@/lib/games/cards";
import { HOST_INTERVAL } from "@/lib/games/poll";
import { MAX_LANES } from "@/lib/games/race";
import { isOver } from "@/lib/games/survival";
import { OPTION_STYLES, type PublicStage } from "@/lib/games/views";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";
import {
  drawAction, finishAction, idleAction, nextAction, openGameAction, pickCardAction, presentAction, redrawAction,
  revealAction, roundAction, showCardsAction, startAction, stopAction, type HostResult,
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
  draw_rounds: "Elimination rounds",
  draw_card_landed: "Participant on stage",
  draw_card_pick: "Pick a card",
  draw_card_reveal: "Card revealed",
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
            {!!state.race?.players && <p className="text-center text-5xl font-extrabold tabular-nums">{state.race.players}<span className="block text-sm font-normal text-muted-foreground">joined</span></p>}
            <Facts rows={[
              ...(state.race?.lanes.map((l) => [l.label, `${l.players} joined`]) ?? []),
              ...(state.race?.more ? [[`+${state.race.more} more`, ""]] : []),
            ]} empty="Waiting for players to join…" />
            <Button className={big} disabled={pending} onClick={() => run(() => startAction(token, v))}>Start race</Button>
          </>
        )}
        {(s.phase === "race_countdown" || s.phase === "race_live") && (
          <>
            {/* Server-rendered a moment before the client hydrates, so the seconds may differ by one. */}
            <p className="text-center text-5xl font-extrabold tabular-nums" suppressHydrationWarning>
              {s.phase === "race_countdown" ? secondsLeft(s.race?.liveFrom ?? null) : `${secondsLeft(s.race?.liveUntil ?? null)}s`}
            </p>
            <Facts rows={state.race?.lanes.slice(0, 5).map((l) => [`${l.place}. ${l.label}`, l.place === 1 ? "Leading" : ""]) ?? []} />
            <Button className={big} variant="destructive" disabled={pending} onClick={() => run(() => stopAction(token, v))}>Stop race</Button>
          </>
        )}
        {s.phase === "race_results" && (
          <>
            <Facts rows={state.race?.lanes.slice(0, 3).map((l) => [`${l.place}. ${l.label}`, ""]) ?? []} />
            {state.race?.mvp && <p className="text-sm">Fastest tapper: <b>{state.race.mvp.name}</b></p>}
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
            <p className="text-sm font-bold">{DRAW_FORMAT_LABELS[state.hostDraw.format]}</p>
            {state.hostDraw.format === "cards"
              ? <p className="text-sm text-muted-foreground">{cardsLeftLabel(state.hostDraw.cardsLeft ?? 0)} · {state.draw?.pool ?? 0} eligible</p>
              : (
                <>
                  <Facts rows={state.hostDraw.progress.map((p) => [p.name, `${p.given}/${p.quantity}`])} />
                  <p className="text-sm text-muted-foreground">{state.draw?.pool ?? 0} eligible</p>
                </>
              )}
            <DrawButtons state={state} pending={pending} onDraw={(mode) => run(() => drawAction(token, v, mode))} />
          </>
        )}
        {(s.phase === "draw_spinning" || s.phase === "draw_reveal" || s.phase === "draw_rounds") && state.hostDraw && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {s.phase === "draw_reveal" ? "On screen now" : "Drawn — the screen has not shown it yet"}
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
            {s.phase === "draw_rounds" && state.draw?.mosaic && (
              <>
                <p className="text-center text-lg font-bold">
                  {state.draw.mosaic.round >= 1 ? `Round ${state.draw.mosaic.round} of ${state.draw.mosaic.rounds}` : "Everyone in the draw"} · {state.draw.mosaic.survivorIds.length} left on screen
                </p>
                <Button className={big} disabled={pending} onClick={() => run(() => roundAction(token, v))}>
                  {state.draw.mosaic.round < state.draw.mosaic.rounds ? `Next round (${state.draw.mosaic.round + 1} of ${state.draw.mosaic.rounds})` : state.hostDraw.spinWinners.length === 1 ? "Show the winner" : "Show the winners"}
                </Button>
              </>
            )}
            {s.phase === "draw_reveal" && <Button className={big} disabled={pending} onClick={() => run(() => presentAction(token, v))}>✓ Present — next prize</Button>}
          </>
        )}
        {s.phase === "draw_card_landed" && state.draw?.cards && (
          <CardLanded name={state.draw.cards.participant?.name ?? null} pending={pending} armed={armed}
            participantId={state.hostDraw?.spinWinners[0]?.id ?? null}
            onShow={() => run(() => showCardsAction(token, v))}
            onAway={(id) => confirmTwice(`redraw:${id}`, () => redrawAction(token, v, id))} />
        )}
        {s.phase === "draw_card_pick" && state.draw?.cards && (
          <CardPicker cards={state.draw.cards} pending={pending} armed={armed}
            participantId={state.hostDraw?.spinWinners[0]?.id ?? null}
            onPick={(no) => run(() => pickCardAction(token, v, no))}
            onAway={(id) => confirmTwice(`redraw:${id}`, () => redrawAction(token, v, id))} />
        )}
        {s.phase === "draw_card_reveal" && state.draw?.cards && (
          <CardRevealed cards={state.draw.cards} cardsLeft={state.hostDraw?.cardsLeft ?? 0} pending={pending}
            onNext={() => run(() => presentAction(token, v))} />
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

/**
 * The next draw (D279, D310): the next prize in the admin's order, one at a time or all that is
 * left of it. The wheel draws one per spin; a card round draws the next participant.
 */
function DrawButtons({ state, pending, onDraw }: { state: HostState; pending: boolean; onDraw: (mode: "one" | "all") => void }) {
  const format = state.hostDraw?.format ?? "slot";
  if (format === "cards") {
    const left = state.hostDraw?.cardsLeft ?? 0;
    return left > 0
      ? <Button className={big} disabled={pending} onClick={() => onDraw("one")}>Spin for the next participant</Button>
      : <p className="text-sm font-bold">All cards have been dealt.</p>;
  }
  const next = state.hostDraw?.progress.find((p) => p.remaining > 0);
  if (!next) return <p className="text-sm font-bold">Every prize has been drawn.</p>;
  if (format === "wheel") return <Button className={big} disabled={pending} onClick={() => onDraw("one")}>Spin the wheel for {next.name}</Button>;
  const verb = format === "mosaic" ? "Start the rounds" : "Draw";
  return (
    <>
      <Button className={big} disabled={pending} onClick={() => onDraw("one")}>{verb}: 1 × {next.name}</Button>
      {next.remaining > 1 && (
        <Button className={big} variant="outline" disabled={pending} onClick={() => onDraw("all")}>
          {verb}: all {next.remaining} remaining
        </Button>
      )}
    </>
  );
}

/**
 * After a card flips (D317): what it held, then back to the waiting reel for the next participant
 * (the host spins from there). After the last card, the same press finishes the round, and the LED
 * shows "All cards dealt".
 */
function CardRevealed({ cards, cardsLeft, pending, onNext }: {
  cards: NonNullable<NonNullable<HostState["draw"]>["cards"]>;
  cardsLeft: number;
  pending: boolean;
  onNext: () => void;
}) {
  const c = cards.slots.find((x) => x.no === cards.picked);
  return (
    <>
      <p className="text-center text-lg font-bold">Card {c?.no}: {c?.prize} — {cards.participant?.name}</p>
      <Button className={big} disabled={pending} onClick={onNext}>
        {cardsLeft > 0 ? "Next participant" : "Finish — all cards dealt"}
      </Button>
    </>
  );
}

/**
 * A card round's reel has landed: the participant comes up while their name stays on the LED, and
 * the host shows the cards when they are ready. "Not here" sends them away first (D318).
 */
function CardLanded({ name, pending, armed, participantId, onShow, onAway }: {
  name: string | null;
  pending: boolean;
  armed: string | null;
  participantId: string | null;
  onShow: () => void;
  onAway: (id: string) => void;
}) {
  return (
    <>
      <p className="text-sm">On stage: <b>{name ?? "—"}</b></p>
      <Button className={big} disabled={pending} onClick={onShow}>Show the cards</Button>
      {participantId && (
        <Button variant="outline" disabled={pending} onClick={() => onAway(participantId)}>
          {armed === `redraw:${participantId}` ? "Tap again" : "Not here — draw someone else"}
        </Button>
      )}
    </>
  );
}

/**
 * The card round's pick (D317): the participant calls a number, the host taps it, then confirms.
 * Taken cards are greyed. "Not here" sends the participant away before a card is chosen (D318).
 */
function CardPicker({ cards, pending, armed, participantId, onPick, onAway }: {
  cards: NonNullable<NonNullable<HostState["draw"]>["cards"]>;
  pending: boolean;
  armed: string | null;
  participantId: string | null;
  onPick: (no: number) => void;
  onAway: (id: string) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <>
      <p className="text-sm">On stage: <b>{cards.participant?.name ?? "—"}</b></p>
      <div className="grid grid-cols-5 gap-2">
        {cards.slots.map((c) => (
          <button key={c.no} type="button" disabled={c.taken || pending} onClick={() => setChosen(c.no)} aria-pressed={chosen === c.no}
            className={`h-14 rounded-lg border text-lg font-extrabold tabular-nums ${c.taken ? "opacity-25" : chosen === c.no ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
            {c.no}
          </button>
        ))}
      </div>
      <Button className={big} disabled={pending || chosen === null} onClick={() => chosen !== null && onPick(chosen)}>
        {chosen === null ? "Tap the card they call out" : `Flip card ${chosen}`}
      </Button>
      {participantId && (
        <Button variant="outline" disabled={pending} onClick={() => onAway(participantId)}>
          {armed === `redraw:${participantId}` ? "Tap again" : "Not here — draw someone else"}
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
            <option value="solo">Everyone solo ({MAX_LANES} on screen)</option>
            <option value="category">By category</option>
            {state.fields.map((f) => <option key={f.key} value={`field:${f.key}`}>By {f.label}</option>)}
          </select>
        </label>
      )}
      {game && <Button className={big} disabled={pending} onClick={() => onOpen(game.id, game.kind === "tap_race" ? grouping : null)}>Open {game.title}</Button>}
    </section>
  );
}
