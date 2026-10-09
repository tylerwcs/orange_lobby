"use client";
import { useState } from "react";
import { MotionConfig, motion } from "motion/react";
import type { PhoneMe, PhoneState } from "../wire";
import type { PublicStage } from "../views";
import { optionStyles } from "../views";
import { phoneInterval } from "../poll";
import { gameFont } from "../font";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";
import { Panel } from "./phone/Panel";
import { TapPad } from "./phone/TapPad";

const phoneEvery = (s: PhoneState) => phoneInterval(s.stage?.phase ?? null);
const SURVIVAL_PLAY = ["survival_question", "survival_locked", "survival_reveal", "survival_over"];
const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${SUFFIX[n % 10] ?? "th"}`);
const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * The attendee's side of every game (D251, D307). It follows the stage by polling (D256): once a
 * second while a game is on, every 5 s otherwise, sending its key so an unchanged stage costs
 * almost nothing. Each state is one full-screen moment; motion is reduced to fades when the phone
 * asks for reduced motion.
 */
export function PlayClient({ token, initial }: { token: string; initial: PhoneState }) {
  const { state, offset, apply } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, phoneEvery, true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const s = state.stage;
  const me = state.me;
  const ticking = !!s && (s.phase === "race_countdown" || s.phase === "race_live" || s.phase === "survival_question");
  const now = useServerNow(offset, 100, ticking);

  const join = async () => {
    setError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/play/${token}/join`, { method: "POST" });
      const body = await res.json().catch(() => ({ error: "Could not join. Try again." }));
      if (res.ok) apply(body as PhoneState);
      else setError((body as { error?: string }).error ?? "Could not join. Try again.");
    } catch {
      setError("Could not join. Check the connection and try again.");
    } finally {
      setJoining(false);
    }
  };
  const joinButton = (label: string) => (
    <Button className="h-16 w-full max-w-xs bg-white font-game text-2xl text-primary hover:bg-white/90" onClick={join} disabled={joining}>
      {joining ? "Joining…" : label}
    </Button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`${gameFont.variable} flex flex-col items-center gap-4 overflow-x-clip text-center`}>
        {s?.game?.title && <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{s.game.title}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!s || !me ? <Panel tone="calm" title="Loading…" /> : (
          <>
            {s.phase === "idle" && (
              <Panel tone="calm" icon="🎮" title="No game on right now">Keep this page open. It switches on by itself when the host starts one.</Panel>
            )}
            {me.kind === "race" && <RacePlay stage={s} me={me} now={now} token={token} joinButton={joinButton} />}
            {me.kind === "survival" && s.phase === "survival_lobby" && (
              me.joined
                ? <Panel tone="brand" icon="🧠" pulse title="You're in!">Watch the screen for question 1.</Panel>
                : <Panel tone="brand" icon="🧠" title="Last one standing">{joinButton("I'm in")}</Panel>
            )}
            {me.kind === "survival" && SURVIVAL_PLAY.includes(s.phase) && (
              // Keyed by the question, so a new question starts with no local pick and no error.
              <SurvivalPlay key={s.question?.no ?? -1} token={token} stage={s} me={me} now={now} />
            )}
            {me.kind === "draw" && (
              me.won
                ? <Panel tone="win" icon="🎉" pulse title={<>You won {me.won}!</>}>Come to the stage.</Panel>
                : me.up
                  ? <Panel tone="brand" icon="🃏" pulse title="You're up!">Come to the stage and pick a card.</Panel>
                  : <Panel tone="calm" icon="🎰" pulse title="Lucky draw is on">Eyes on the screen!</Panel>
            )}
          </>
        )}
      </div>
    </MotionConfig>
  );
}

type RaceMe = Extract<PhoneMe, { kind: "race" }>;

function RacePlay({ stage, me, now, token, joinButton }: { stage: PublicStage; me: RaceMe; now: number; token: string; joinButton: (label: string) => React.ReactNode }) {
  const missed = <Panel tone="calm" icon="⏱️" title="The race has started">Catch the next one!</Panel>;
  if (stage.phase === "race_lobby") {
    return me.joined
      ? <Panel tone="brand" icon="🏁" pulse title="You're in!">Racing for <b>{me.lane}</b>. Get ready to tap!</Panel>
      : <Panel tone="brand" icon="🏁" title={<>Racing for {me.lane}</>}>{joinButton("Join the race")}</Panel>;
  }
  if (stage.phase === "race_countdown" && stage.race) {
    if (!me.joined) return missed;
    const n = Math.max(1, Math.ceil((stage.race.liveFrom - now) / 1000));
    return (
      <Panel tone="brand" title={
        <motion.span key={n} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="block text-[160px] leading-none" suppressHydrationWarning>{n}</motion.span>
      }>Get ready…</Panel>
    );
  }
  if (stage.phase === "race_live" && stage.race) {
    return me.joined ? <TapPad token={token} secondsLeft={Math.max(0, Math.ceil((stage.race.liveUntil - now) / 1000))} /> : missed;
  }
  if (stage.phase === "race_results") {
    if (!me.joined || !me.place) return <Panel tone="calm" icon="🏁" title="Race over">See the screen for the results.</Panel>;
    return (
      <Panel tone={me.place === 1 ? "win" : "brand"} icon={MEDALS[me.place - 1] ?? "🏁"} title={<>{me.lane} finished {ordinal(me.place)}</>}>
        of {me.lanes}
      </Panel>
    );
  }
  return null;
}

type SurvivalMe = Extract<PhoneMe, { kind: "survival" }>;

/** One question of last one standing. The parent keys it by question number (see PlayClient). */
function SurvivalPlay({ token, stage, me, now }: { token: string; stage: PublicStage; me: SurvivalMe; now: number }) {
  const q = stage.question;
  const [picked, setPicked] = useState<number | null>(me.answered);
  const [error, setError] = useState<string | null>(null);
  const styles = optionStyles(stage.game?.green ?? false);

  if (!me.joined) return <Panel tone="calm" icon="👀" title="This game started without you">Watch the screen. The next one is yours!</Panel>;
  const outBefore = me.outAt !== null && (q === null || me.outAt < q.no);
  if (stage.phase === "survival_over") {
    return me.outAt === null
      ? <Panel tone="win" icon="🏆" pulse title="You won!" />
      : <Panel tone="calm" icon="🏁" title="Game over">See the screen for the winner.</Panel>;
  }
  if (!q) return null;
  if (stage.phase === "survival_reveal") {
    if (outBefore) return <Panel tone="calm" icon="👀" title="You're out">Watching.</Panel>;
    return me.outAt === q.no
      ? <Panel tone="out" icon="❌" title="You're out">Stay and watch who wins!</Panel>
      : <Panel tone="go" icon="✅" pulse title="You're through!" />;
  }

  const answer = async (choice: number) => {
    setError(null);
    setPicked(choice);
    try {
      const res = await fetch(`/api/play/${token}/answer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.no, choice }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; choice?: number; error?: string };
      if (body.ok && typeof body.choice === "number") setPicked(body.choice);
      else { setPicked(null); setError(body.error ?? "That answer did not go through."); }
    } catch {
      setPicked(null);
      setError("That answer did not go through. Check the connection and try again.");
    }
  };
  const locked = stage.phase === "survival_locked" || picked !== null || outBefore;

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm font-bold text-muted-foreground" suppressHydrationWarning>
        Question {q.no + 1} of {q.total}
        {stage.phase === "survival_question" && q.deadline ? ` · ${Math.max(0, Math.ceil((q.deadline - now) / 1000))}s` : ""}
      </p>
      <p className="font-game text-2xl leading-tight">{q.text}</p>
      {outBefore && <p className="text-sm text-muted-foreground">You&apos;re out — watching this one.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-3">
        {q.options.map((o, i) => (
          <motion.button key={i} type="button" disabled={locked} onClick={() => answer(i)} whileTap={{ scale: 0.96 }}
            animate={{ opacity: locked && picked !== i ? 0.3 : 1, scale: picked === i ? 1.02 : 1 }}
            className="flex min-h-20 items-center gap-4 rounded-2xl px-5 text-left font-game text-2xl text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)]"
            style={{ background: styles[i].colour }}>
            <span aria-hidden className="text-3xl">{styles[i].shape}</span>
            <span className="min-w-0 flex-1">{o}</span>
            {picked === i && <span aria-hidden>✓</span>}
          </motion.button>
        ))}
      </div>
      {picked !== null && <p className="font-game text-xl">Locked in — look at the screen</p>}
      {picked === null && stage.phase === "survival_locked" && !outBefore && <p className="text-sm text-muted-foreground">Time&apos;s up.</p>}
    </div>
  );
}
