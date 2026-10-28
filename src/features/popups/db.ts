import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { ActivitySession, Event } from "@/lib/types";
import type { PopupInput, PortalPopup } from "./types";

/** In the organiser's order: the first that applies is the one an attendee sees (D754). */
export async function listPopups(eventId: string): Promise<PortalPopup[]> {
  const { data, error } = await serviceClient().from("portal_popups").select("*").eq("event_id", eventId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return data as PortalPopup[];
}

/** A new popup goes last, so it never takes the turn of one already running. */
export async function createPopup(event: Pick<Event, "id" | "org_id">, input: PopupInput) {
  const db = serviceClient();
  const { data: last } = await db.from("portal_popups").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("portal_popups")
    .insert({ org_id: event.org_id, event_id: event.id, ...input, trigger_kind: "not_done", sort_order: (last?.sort_order ?? 0) + 10 });
  if (error) throw error;
}

export async function updatePopup(id: string, eventId: string, input: PopupInput) {
  const { error } = await serviceClient().from("portal_popups").update(input).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function setPopupOn(id: string, eventId: string, on: boolean) {
  const { error } = await serviceClient().from("portal_popups").update({ is_on: on }).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deletePopup(id: string, eventId: string) {
  const { error } = await serviceClient().from("portal_popups").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Scoped by event as well as id, so a posted id from another event reorders nothing. Steps of 10, as announcements. */
export async function setPopupOrder(eventId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [n, id] of orderedIds.entries()) {
    const { error } = await db.from("portal_popups").update({ sort_order: (n + 1) * 10 }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}

/** Only the popups' activities' sessions, not the whole event's (D752). Times as `HH:MM`, like `listSessions`. */
export async function sessionsForActivities(activityIds: string[]): Promise<ActivitySession[]> {
  if (activityIds.length === 0) return [];
  const { data, error } = await serviceClient().from("activity_sessions").select("*").in("activity_id", activityIds);
  if (error) throw error;
  return (data as ActivitySession[]).map((s) => ({
    ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at?.slice(0, 5) ?? null,
  }));
}

/** Bookings per session id, for the same activities only. */
export async function bookingCountsForActivities(activityIds: string[]): Promise<Record<string, number>> {
  if (activityIds.length === 0) return {};
  const { data, error } = await serviceClient().from("activity_bookings").select("session_id").in("activity_id", activityIds);
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.session_id as string] = (acc[r.session_id as string] ?? 0) + 1;
    return acc;
  }, {});
}
