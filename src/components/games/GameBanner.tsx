"use client";
import Link from "next/link";
import type { PhoneState } from "@/lib/games/wire";
import type { Phase } from "@/lib/games/phase";
import { usePoll } from "./usePoll";

const every = () => 5000;
const PLAYING: ReadonlySet<Phase> = new Set<Phase>([
  "race_lobby", "race_countdown", "race_live",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal",
]);

/**
 * "Game on — tap to join" on the portal home while a race or last one standing is in its lobby
 * or live (D254), and "You won" for a draw winner (D282). Polls every 5 s; rendered only on
 * events that have a game at all.
 */
export function GameBanner({ token, basePath, initial }: { token: string; basePath: string; initial: PhoneState }) {
  const { state } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, every, true);
  const s = state.stage;
  const me = state.me;
  if (me?.kind === "draw" && me.won) {
    return (
      <div role="status" className="rounded-xl bg-primary p-4 text-center text-primary-foreground">
        <b className="text-lg">🎉 You won {me.won}!</b>
        <p className="text-sm">Come to the stage.</p>
      </div>
    );
  }
  if (!s || !PLAYING.has(s.phase)) return null;
  const joining = s.phase === "race_lobby" || s.phase === "survival_lobby";
  return (
    <Link href={`${basePath}/play`} className="flex items-center gap-3 rounded-xl bg-primary p-4 text-primary-foreground">
      <span className="text-3xl" aria-hidden>🎮</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate">{joining ? "Game on — tap to join" : "Game on — tap to play"}</b>
        <span className="truncate text-sm opacity-90">{s.game?.title}</span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  );
}
