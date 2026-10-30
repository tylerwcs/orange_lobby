"use server";
import { loadPortalAttendee } from "@/lib/portal";
import { markSeen, rankOf } from "@/features/qualifier";

/**
 * The page has shown the player where they stand (D772): their rank now is the baseline for the
 * next "you dropped" banner (D771), so the same fall is announced once. Called once on mount.
 */
export async function markSeenAction(slug: string, token: string): Promise<void> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const rank = await rankOf(event.id, attendee.id);
  await markSeen(event.id, attendee.id, rank);
}
