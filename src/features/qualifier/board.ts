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

/** A board row as the memoised snapshot holds it. */
export type SeenRow = { rank: number; id: string; wpm: number };

/**
 * Whether the shared (memoised) board snapshot disagrees with the caller's own fresh rank, so
 * their own row would be missing, at the wrong place or at the old wpm (D771). `board` covers
 * the top 20 and the total; `around` covers the rows beside a caller past rank 20. Someone else
 * moving does not make a snapshot stale for the caller unless it moves the caller's rank.
 * Null rank (not on the board) is never stale.
 */
export function needsFreshSlice(p: {
  top: readonly SeenRow[]; around: readonly SeenRow[];
  myId: string; myRank: number | null; myWpm: number | null; total: number;
}): { board: boolean; around: boolean } {
  const { myId, myRank, myWpm } = p;
  if (myRank === null) return { board: false, around: false };
  const isMe = (r: SeenRow | undefined) => !!r && r.id === myId && (myWpm === null || r.wpm === myWpm);
  const mineInTop = p.top.filter((r) => r.id === myId);
  const board = myRank > p.total
    || mineInTop.some((r) => r.rank !== myRank)
    || (myRank <= BOARD_TOP && !isMe(p.top.find((r) => r.rank === myRank)));
  const around = myRank > BOARD_TOP && !isMe(p.around.find((r) => r.rank === myRank));
  return { board, around };
}

/** The ranks to fetch beside a caller past rank 20, never reaching into the top 20. */
export function aroundWindow(myRank: number): { offset: number; limit: number } {
  const first = Math.max(myRank - 1, BOARD_TOP + 1);
  return { offset: first - 1, limit: myRank + 1 - first + 1 };
}
