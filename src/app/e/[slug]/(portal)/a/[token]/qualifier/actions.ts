"use server";
import { loadPortalAttendee } from "@/lib/portal";
import { nowInKL } from "@/lib/time";
import { SKINS, getPlayer, markSeen, setSkin, streakDays, unlockedSkins } from "@/features/qualifier";

/** Far above any board (the spec plans for about 1,000 players): a rank past it is not one. */
const MAX_RANK = 1_000_000;

/**
 * The page has shown the player where they stand (D772): the rank it showed is the baseline for
 * the next "you dropped" banner (D771), so the same fall is announced once. Called once on
 * mount with the rank the server rendered (view.me.rank), so the board is not ranked a second
 * time per page load. The rank comes back through the browser, so it is trusted for nothing but
 * this: it only ever writes the token holder's own last_seen_rank, which only feeds their own
 * banner. Anything that isn't a whole rank (or null, off the board) is ignored.
 */
export async function markSeenAction(slug: string, token: string, rank: number | null): Promise<void> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (rank !== null && !(Number.isInteger(rank) && rank >= 1 && rank <= MAX_RANK)) return;
  await markSeen(event.id, attendee.id, rank);
}

/**
 * Picks the ship colour (D774). The skin must be one of the six and unlocked for this player
 * right now (the same rules the page lists them by); anything else is refused and nothing is
 * saved. A skin is decoration only: it never touches the score (D767).
 */
export async function chooseSkinAction(slug: string, token: string, skin: string): Promise<{ ok: boolean }> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const chosen = SKINS.find((s) => s === skin);
  if (!chosen) return { ok: false };
  const player = await getPlayer(event.id, attendee.id);
  if (!player) return { ok: false };
  const streak = streakDays(player.run_days, nowInKL().date);
  if (!unlockedSkins({ runs: player.runs_played, streak, best: player.best_wpm }).includes(chosen)) return { ok: false };
  await setSkin(event.id, attendee.id, chosen);
  return { ok: true };
}
