import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { requireFeature } from "@/features/catalogue";
import type { Activity, Event } from "@/lib/types";
import { getTournamentActivity } from "../db/tournaments";

/**
 * What every organiser write on a tournament starts and ends with (D648, D664): event access, then
 * the engagement add-on, then the tournament itself; and back to its tab with a flash.
 */

export type TournamentTab = "sports" | "squads" | "matches" | "leaderboard";

export const tabPath = (eventId: string, activityId: string, tab: TournamentTab, sportId?: string) => {
  const qs = new URLSearchParams({ tab });
  if (sportId) qs.set("sport", sportId);
  return `/admin/events/${eventId}/activities/${activityId}?${qs}`;
};

export async function tournament(eventId: string, activityId: string): Promise<{ ev: Event; cup: Activity }> {
  const { ev } = await requireEventAccess(eventId);
  const list = `/admin/events/${eventId}/activities`;
  await requireFeature(ev.id, "engagement", list);
  const cup = await getTournamentActivity(activityId, ev.id);
  if (!cup) redirect(flashPath(list, "That tournament no longer exists.", "error"));
  return { ev, cup };
}

export const formOf = (fd: FormData) => ({
  text: (k: string) => String(fd.get(k) ?? "").trim(),
  checked: (k: string) => fd.get(k) !== null,
});

export function done(eventId: string, activityId: string, back: string, message: string, tone?: "error"): never {
  revalidatePath(`/admin/events/${eventId}/activities`);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(back, message, tone));
}
