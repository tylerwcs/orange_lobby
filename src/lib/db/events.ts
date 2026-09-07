import "server-only";
import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import type { Event, EventStatus } from "@/lib/types";

export { slugify } from "@/lib/slug";

export async function listEvents(orgId: string): Promise<Event[]> {
  const { data, error } = await serviceClient().from("events").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Event[];
}

export async function getEvent(id: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("id", id).maybeSingle();
  return (data as Event) ?? null;
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("slug", slug).maybeSingle();
  return (data as Event) ?? null;
}

export async function requireEvent(id: string, orgId: string): Promise<Event> {
  const ev = await getEvent(id);
  if (!ev || ev.org_id !== orgId) notFound();
  return ev;
}

export async function createEvent(orgId: string, input: { name: string; slug: string }): Promise<Event> {
  const { data, error } = await serviceClient().from("events").insert({ org_id: orgId, ...input }).select("*").single();
  if (error) throw error;
  return data as Event;
}

export async function updateEvent(id: string, patch: Partial<Event>): Promise<void> {
  const { error } = await serviceClient().from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function setEventStatus(id: string, status: EventStatus) {
  await updateEvent(id, { status });
}
