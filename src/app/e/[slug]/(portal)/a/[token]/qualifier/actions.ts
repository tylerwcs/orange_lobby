"use server";
import { loadPortalAttendee } from "@/lib/portal";
import { nowInKL } from "@/lib/time";
import { SKINS, getPlayer, markSeen, rankOf, setSkin, streakDays, unlockedSkins } from "@/features/qualifier";

/**
 * The page has shown the player where they stand (D772): their rank now is the baseline for the
 * next "you dropped" banner (D771), so the same fall is announced once. Called once on mount.
 */
export async function markSeenAction(slug: string, token: string): Promise<void> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const rank = await rankOf(event.id, attendee.id);
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
