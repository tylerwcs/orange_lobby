"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayState } from "@/lib/games/wire";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { Mosaic } from "./Mosaic";
import { QuestionBoard } from "./QuestionBoard";
import { JointWinners, WinnerCard } from "./WinnerCard";
import { useStep } from "./useStep";

/** Reveal timeline (D275): answer 0–1 s, mosaic at 1 s, ripple from 1.2 s, regroup at 4.7 s. */
const MARKS = [1000, 1200, 4700] as const;

/** Last one standing on the LED (D274–D276): lobby mosaic, question, split, reveal, winners. */
export function SurvivalScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const sv = state.survival!;
  const now = useServerNow(offset, 200, s.phase === "survival_question");
  const title = s.game?.title ?? "Last one standing";
  const green = s.game?.green ?? false;

  if (s.phase === "survival_lobby") {
    return (
      <Frame title={title} right={`${sv.players.length} in`}>
        <div className="flex h-full flex-col gap-6">
          <p className="text-center font-game text-5xl drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">Open {APP_NAME} → Games and tap “I’m in”</p>
          <div className="min-h-0 flex-1"><Mosaic people={sv.players} height={780} /></div>
        </div>
      </Frame>
    );
  }
  if ((s.phase === "survival_question" || s.phase === "survival_locked") && s.question) {
    return (
      <Frame title={title}>
        <QuestionBoard q={s.question} now={now} answered={sv.answered} players={sv.players.length}
          split={s.phase === "survival_locked" ? sv.split : null} showTimer={s.phase === "survival_question"} green={green} />
      </Frame>
    );
  }
  if (s.phase === "survival_reveal" && s.question) return <RevealSequence key={s.key} state={state} />;
  if (s.phase === "survival_over") {
    if (sv.winners.length === 1) return <WinnerCard label="Last one standing" name={sv.winners[0].name} company={sv.winners[0].company} />;
    return <JointWinners title="Last ones standing" winners={sv.winners} />;
  }
  return null;
}

/**
 * The reveal (D275), replayed from the start whenever it mounts — keyed by the stage key, so a
 * new reveal or a reloaded LED starts it again, with the same ripple order.
 */
function RevealSequence({ state }: { state: DisplayState }) {
  const s = state.stage;
  const sv = state.survival!;
  const q = s.question!;
  const green = s.game?.green ?? false;
  const step = useStep(MARKS);
  const dark = useMemo(() => new Set(sv.eliminatedIds), [sv.eliminatedIds]);
  const everyone = s.reveal?.everyoneSurvived ?? false;
  const before = sv.players.length;
  const after = everyone ? before : s.reveal?.remaining ?? before - dark.size;
  const title = s.game?.title ?? "Last one standing";
  // At the regroup the eliminated tiles are dropped and the survivors remount without the
  // darken classes, so their pop-in animation runs again at the bigger size.
  const regrouped = step >= 3 && !everyone;

  if (step === 0) {
    return <Frame title={title}><QuestionBoard q={q} now={0} split={sv.split} green={green} /></Frame>;
  }
  return (
    <div className="flex h-full flex-col px-10 pb-6 pt-6">
      <header className="flex items-baseline justify-between pb-4">
        <span className="font-game text-5xl">{everyone && step >= 2 ? "Everyone survives!" : `Question ${q.no + 1}`}</span>
        <RevealCounter from={before} to={after} running={step >= 2} />
      </header>
      <div className={`min-h-0 flex-1 ${everyone && step >= 2 ? "mosaic-flash" : ""}`}>
        {/* A new key at the regroup remounts the tiles, so the survivors pop into their bigger places. */}
        <Mosaic key={regrouped ? "survivors" : "all"} people={sv.players}
          darkIds={everyone ? undefined : dark} darken={step >= 2 && !regrouped} hideDark={regrouped} seed={s.key} height={960} />
      </div>
    </div>
  );
}

/** "312 → 38 remain", ticking down over the ripple's two seconds. */
function RevealCounter({ from, to, running }: { from: number; to: number; running: boolean }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      const p = Math.min(1, (performance.now() - start) / 2000);
      setShown(Math.round(from - (from - to) * p));
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, from, to]);
  return (
    <motion.span key={running ? "running" : "idle"} initial={running ? { scale: 1.4 } : false} animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 12, delay: running ? 2 : 0 }} className="font-game text-6xl tabular-nums">
      {running ? <>{from} → <span className="text-[var(--brand)]">{shown}</span> remain</> : `${from} in`}
    </motion.span>
  );
}
