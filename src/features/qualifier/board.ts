// What the portal shows of the board (D771): the first 20 ranks, and the player's own row with
// the rows just above and below it when they are further down. Pure, so it is tested without a
// database and lives in the client-safe entry (the view's types are read by the page).
import type { SkinId } from "./progress";

export type BoardEntry = { rank: number; label: string; skin: SkinId | null; wpm: number; me: boolean };

/** The ranks the board always shows. */
export const BOARD_TOP = 20;

/**
 * `top` is ranks 1-20. `around` is ranks myRank-1 to myRank+1 when myRank is past 20, minus any
 * rank `top` already has (so #21 gets 21 and 22); empty otherwise. Both come back in rank order.
 */
export function boardSlices(rows: BoardEntry[], myRank: number | null): { top: BoardEntry[]; around: BoardEntry[] } {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const top = sorted.filter((r) => r.rank <= BOARD_TOP);
  if (myRank === null || myRank <= BOARD_TOP) return { top, around: [] };
  return { top, around: sorted.filter((r) => r.rank > BOARD_TOP && r.rank >= myRank - 1 && r.rank <= myRank + 1) };
}
