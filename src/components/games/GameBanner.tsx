"use client";
import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import type { PhoneState } from "@/lib/games/wire";
import type { Phase } from "@/lib/games/phase";
import { gameFont } from "@/lib/games/font";
import { usePoll } from "./usePoll";

const every = () => 5000;
const PLAYING: ReadonlySet<Phase> = new Set<Phase>([
  "race_lobby", "race_countdown", "race_live",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal",
]);

/**
 * "Game on" on the portal home while a race or last one standing is in its lobby or live (D254,
 * D308), "You won" for a draw winner (D282) and "You're up" for a card round's participant
 * (D319). Polls every 5 s; rendered only on events that have a game at all.
 */
export function GameBanner({ token, basePath, initial }: { token: string; basePath: string; initial: PhoneState }) {
  const { state } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, every, true);
  const s = state.stage;
  const me = state.me;
  if (me?.kind === "draw" && (me.won || me.up)) {
    return (
      <div role="status" className={`${gameFont.variable} rounded-2xl bg-amber-400 p-4 text-center text-amber-950 shadow-lg`}>
        <b className="font-game text-2xl">{me.won ? `🎉 You won ${me.won}!` : "🃏 You're up!"}</b>
        <p className="text-sm">{me.won ? "Come to the stage." : "Come to the stage and pick a card."}</p>
      </div>
    );
  }
  if (!s || !PLAYING.has(s.phase)) return null;
  const joining = s.phase === "race_lobby" || s.phase === "survival_lobby";
  return (
    <MotionConfig reducedMotion="user">
      <Link href={`${basePath}/play`} className={`${gameFont.variable} relative flex items-center gap-4 overflow-hidden rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg`}>
        <span className="relative flex size-4 shrink-0">
          <motion.span className="absolute inset-0 rounded-full bg-white" animate={{ scale: [1, 2.2], opacity: [0.7, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} />
          <span className="relative size-4 rounded-full bg-white" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="font-game text-xl leading-tight">Game on!</b>
          <span className="truncate text-sm opacity-90">{s.game?.title}</span>
        </span>
        <span className="shrink-0 rounded-full bg-white px-4 py-2 font-game text-base text-primary">{joining ? "Join now" : "Play"}</span>
      </Link>
    </MotionConfig>
  );
}
