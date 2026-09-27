import type { Attendee } from "@/lib/types";
import type { Prize } from "@/lib/games/config";
import { categoryParts } from "@/lib/agenda";

export type WinnerRow = {
  id: string;
  event_id: string;
  game_id: string;
  /** Null while a card round's participant has not picked a card yet (D317). */
  prize_no: number | null;
  attendee_id: string;
  drawn_at: string;
  void: boolean;
  /** The run that drew them (0050); null on rows drawn before it. */
  run_id?: string | null;
  /** The card picked in a card round, numbered from 1 (D317). */
  card_no?: number | null;
};

/**
 * Who can win (D278): checked in at the draw's checkpoint, no part of their category excluded,
 * not already a standing winner of any draw in this event, and not marked "not here" for the
 * prize being drawn (`absent`, see absentFor). A category may name several programmes
 * ("KOM, Crew" - see `categoryParts`), and one excluded part is enough to leave the person out,
 * so leaving out Crew also leaves out "KOM, Crew". Excluded names compare trimmed and
 * case-insensitive; an empty list excludes no one, people with no category included.
 * Mirrors draw_spin in 0049_games.sql (its category_matches from 0048), which is what actually
 * picks; this is for the host's "184 eligible" and the LED's rolling names. Change both together.
 */
export function eligiblePool<A extends Pick<Attendee, "id" | "category">>(
  attendees: A[], checkedIn: ReadonlySet<string>, exclude: string[], pastWinners: ReadonlySet<string>,
  absent: ReadonlySet<string> = new Set(),
): A[] {
  const excluded = new Set(exclude.map((s) => s.trim().toLowerCase()));
  return attendees.filter(
    (a) => checkedIn.has(a.id) && !categoryParts(a.category).some((p) => excluded.has(p))
      && !pastWinners.has(a.id) && !absent.has(a.id),
  );
}

/**
 * Winners who still hold their prize. A voided winner was "not here" and may win again (D281),
 * but not the same prize (absentFor).
 */
export function standingWinners(rows: WinnerRow[]): Set<string> {
  return new Set(rows.filter((r) => !r.void).map((r) => r.attendee_id));
}

/**
 * Who was marked "not here" for this prize of this draw (D281). They stay out of its pool, so
 * "Not here — redraw" never draws the person it just sent away (draw_spin's void rule).
 */
export function absentFor(rows: WinnerRow[], gameId: string, prizeNo: number): Set<string> {
  return new Set(rows.filter((r) => r.void && r.game_id === gameId && r.prize_no === prizeNo).map((r) => r.attendee_id));
}

export type PrizeProgress = { prize_no: number; name: string; quantity: number; given: number; remaining: number };

export function prizeProgress(prizes: Prize[], winners: WinnerRow[]): PrizeProgress[] {
  return prizes.map((p, prize_no) => {
    const given = winners.filter((w) => w.prize_no === prize_no && !w.void).length;
    return { prize_no, name: p.name, quantity: p.quantity, given, remaining: Math.max(0, p.quantity - given) };
  });
}

/** Prizes are drawn in the order the admin listed them (D279). */
export function nextPrize(progress: PrizeProgress[]): PrizeProgress | null {
  return progress.find((p) => p.remaining > 0) ?? null;
}

export function drawCount(prize: PrizeProgress, mode: "one" | "all", pool: number): number {
  return Math.max(0, Math.min(mode === "one" ? 1 : prize.remaining, prize.remaining, pool));
}

/**
 * The pool as it stood before the draw on stage, in a fixed order, for the LED's rolling names
 * (D280). draw_spin records the winners at once, so a freshly loaded pool no longer holds them
 * while a memoised one (another server instance, up to its time-to-live) still does. Adding the
 * drawn people back and sorting by id makes both give the same set in the same order, so two
 * polls during a spin never differ by exactly the winners — the answer is not on the wire early.
 */
export function poolBeforeDraw<A extends { id: string }>(pool: A[], drawn: A[]): A[] {
  const byId = new Map(pool.map((a) => [a.id, a]));
  for (const a of drawn) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
