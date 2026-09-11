import "server-only";
import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import type { Event, EventStatus } from "@/lib/types";
import { parseAttendeeFields } from "@/lib/attendee-fields";

export { slugify } from "@/lib/slug";

/**
 * Normalises the jsonb columns on the way out of the database. `attendee_fields` is
 * hand-editable state that predates any validation, so every read goes through the
 * parser rather than trusting the column shape.
 */
function hydrate(row: unknown): Event {
  const ev = row as Event;
  return { ...ev, attendee_fields: parseAttendeeFields((row as { attendee_fields?: unknown }).attendee_fields) };
}

export async function listEvents(orgId: string): Promise<Event[]> {
  const { data, error } = await serviceClient().from("events").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown[]).map(hydrate);
}

export async function getEvent(id: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("id", id).maybeSingle();
  return data ? hydrate(data) : null;
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("slug", slug).maybeSingle();
  return data ? hydrate(data) : null;
}

export async function requireEvent(id: string, orgId: string): Promise<Event> {
  const ev = await getEvent(id);
  if (!ev || ev.org_id !== orgId) notFound();
  return ev;
}

export async function createEvent(orgId: string, input: { name: string; slug: string }): Promise<Event> {
  const { data, error } = await serviceClient().from("events").insert({ org_id: orgId, ...input }).select("*").single();
  if (error) throw error;
  return hydrate(data);
}

export async function updateEvent(id: string, patch: Partial<Event>): Promise<void> {
  const { error } = await serviceClient().from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function setEventStatus(id: string, status: EventStatus) {
  await updateEvent(id, { status });
}
