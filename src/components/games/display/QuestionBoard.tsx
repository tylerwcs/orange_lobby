"use client";
import { motion } from "motion/react";
import type { PublicQuestion } from "@/lib/games/views";
import { optionStyles } from "@/lib/games/views";
import { TimerRing } from "./TimerRing";

/**
 * A question on the LED (D276, D306): the question slides in, then four glossy tiles with colour
 * and shape; a draining timer ring; the room's split growing in at the lock; at the reveal the
 * wrong tiles shake and fade and the right one pulses.
 */
export function QuestionBoard({ q, now, answered, players, split, showTimer = false, green = false }: {
  q: PublicQuestion;
  now: number;
  answered?: number;
  players?: number;
  split?: number[] | null;
  showTimer?: boolean;
  green?: boolean;
}) {
  const styles = optionStyles(green);
  const left = q.deadline ? Math.max(0, (q.deadline - now) / 1000) : 0;
  const total = split ? Math.max(1, split.reduce((a, b) => a + b, 0)) : 1;
  const revealed = q.correct !== null;
  return (
    <div className="flex h-full flex-col gap-8">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/40 px-6 py-2 text-3xl font-bold">Question {q.no + 1} of {q.total}</span>
        {showTimer ? <TimerRing left={left} total={q.answer_s} /> : !revealed && <span className="font-game text-5xl">Time&apos;s up!</span>}
      </div>
      <motion.p key={q.no} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 18 }}
        className="text-center font-game text-[76px] leading-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">{q.text}</motion.p>
      <div className="grid flex-1 grid-cols-2 gap-6">
        {q.options.map((o, i) => {
          const right = q.correct === i;
          const wrong = revealed && !right;
          return (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.85 }}
              animate={wrong ? { opacity: 0.25, x: [0, -14, 14, -8, 8, 0], scale: 1 } : right ? { opacity: 1, scale: [1, 1.04, 1] } : { opacity: 1, scale: 1 }}
              transition={wrong ? { duration: 0.5 } : right ? { repeat: Infinity, duration: 1.2 } : { type: "spring", stiffness: 200, damping: 18, delay: 0.25 + i * 0.08 }}
              className={`relative flex items-center gap-6 overflow-hidden rounded-[32px] px-10 font-game text-6xl shadow-[inset_0_-10px_0_rgba(0,0,0,0.25),0_12px_30px_rgba(0,0,0,0.35)] ${right ? "ring-[10px] ring-white" : ""}`}
              style={{ background: styles[i].colour }}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              {split && (
                <motion.div className="absolute inset-y-0 left-0 bg-white/20" initial={{ width: 0 }}
                  animate={{ width: `${((split[i] ?? 0) / total) * 100}%` }} transition={{ duration: 0.8 }} />
              )}
              <span className="relative text-7xl">{styles[i].shape}</span>
              <span className="relative min-w-0 flex-1 truncate">{o}</span>
              {split && <span className="relative tabular-nums">{split[i] ?? 0}</span>}
              {right && <span className="relative">✓</span>}
            </motion.div>
          );
        })}
      </div>
      {showTimer && answered !== undefined && <p className="text-center text-4xl opacity-85">{answered} of {players ?? 0} answered</p>}
    </div>
  );
}
