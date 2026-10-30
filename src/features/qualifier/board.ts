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

/** A board row before the player's own flag is set: who, at which rank, and what is shown. */
export type RankedRow = { rank: number; id: string; label: string; skin: SkinId | null; wpm: number };

/**
 * The board once the finalists are confirmed (D769, spec "When the window closes"). The finale
 * list is the snapshot, not the live board: a finalist cancelled, moved into a left-out category
 * or deleted after the confirm stays on it, and no one moves up above the cut. Finalists keep
 * their snapshot ranks (1 to `cut`, the snapshot's last rank); everyone else on the live board
 * follows below the cut in live order, numbered from cut + 1.
 *
 * `live` is what was read of the live board (its first rows, and the rows around the player),
 * with live ranks; `myLiveRank` and `liveTotal` are live too. The numbering is exact while every
 * finalist still on the live board is among the rows read, which only fails once 11 or more
 * people have been placed above a finalist after the confirm.
 */
export function confirmedBoard(p: {
  finalists: readonly RankedRow[]; live: readonly RankedRow[];
  myId: string; myLiveRank: number | null; liveTotal: number;
}): { entries: BoardEntry[]; rank: number | null; total: number; cut: number } {
  const through = new Set(p.finalists.map((f) => f.id));
  const cut = p.finalists.reduce((m, f) => Math.max(m, f.rank), 0);
  const finalistsLive = p.live.filter((r) => through.has(r.id)).map((r) => r.rank);
  // Everyone ahead on the live board who is not a finalist, after the whole snapshot.
  const finalRank = (liveRank: number) => liveRank + cut - finalistsLive.filter((r) => r < liveRank).length;
  const entry = (r: RankedRow, rank: number): BoardEntry =>
    ({ rank, label: r.label, skin: r.skin, wpm: r.wpm, me: r.id === p.myId });
  const mine = p.finalists.find((f) => f.id === p.myId);
  return {
    entries: [
      ...p.finalists.map((f) => entry(f, f.rank)),
      ...p.live.filter((r) => !through.has(r.id)).map((r) => entry(r, finalRank(r.rank))),
    ],
    rank: mine ? mine.rank : p.myLiveRank === null ? null : finalRank(p.myLiveRank),
    total: finalRank(p.liveTotal + 1) - 1,
    cut,
  };
}

/** The ranks to fetch beside a caller past rank 20, never reaching into the top 20. */
export function aroundWindow(myRank: number): { offset: number; limit: number } {
  const first = Math.max(myRank - 1, BOARD_TOP + 1);
  return { offset: first - 1, limit: myRank + 1 - first + 1 };
}
