import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Announcement, Event } from "@/lib/types";

/** In the organiser's order (D249). Newest first breaks a tie, which only an old row can have. */
export async function listAnnouncements(eventId: string): Promise<Announcement[]> {
  const { data, error } = await serviceClient().from("announcements").select("*").eq("event_id", eventId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Announcement[];
}

export type AnnouncementInput = { title: string; body: string; pinned: boolean; categories: string[] | null };

/** A new announcement goes above the others, as the newest always has; dragging moves it from there. */
export async function createAnnouncement(event: Pick<Event, "id" | "org_id">, input: AnnouncementInput) {
  const db = serviceClient();
  const { data: first } = await db.from("announcements").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  const { error } = await db.from("announcements")
    .insert({ org_id: event.org_id, event_id: event.id, ...input, sort_order: (first?.sort_order ?? 10) - 10 });
  if (error) throw error;
}

export async function updateAnnouncement(id: string, eventId: string, input: AnnouncementInput) {
  const { error } = await serviceClient().from("announcements").update(input).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string, eventId: string) {
  const { error } = await serviceClient().from("announcements").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Scoped by event as well as id, so a posted id from another event reorders nothing. Same steps of 10 as info tabs. */
export async function setAnnouncementOrder(eventId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [n, id] of orderedIds.entries()) {
    const { error } = await db.from("announcements").update({ sort_order: (n + 1) * 10 }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}
