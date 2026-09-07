import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Announcement, Event } from "@/lib/types";

export async function listAnnouncements(eventId: string): Promise<Announcement[]> {
  const { data, error } = await serviceClient().from("announcements").select("*").eq("event_id", eventId).order("pinned", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Announcement[];
}
export async function createAnnouncement(event: Pick<Event, "id" | "org_id">, input: { title: string; body: string; pinned: boolean }) {
  const { error } = await serviceClient().from("announcements").insert({ org_id: event.org_id, event_id: event.id, ...input });
  if (error) throw error;
}
export async function deleteAnnouncement(id: string) {
  const { error } = await serviceClient().from("announcements").delete().eq("id", id);
  if (error) throw error;
}
