import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import type { Event, EventStatus } from "@/lib/types";
import { parseAttendeeFields } from "@/lib/attendee-fields";
import { hydratePins } from "@/lib/pinned-fields";
import { generateToken } from "@/lib/tokens";

export { slugify } from "@/lib/slug";

/**
 * Normalises the jsonb columns on the way out of the database. `attendee_fields` and
 * `pinned_fields` are hand-editable state that predates any validation, so every read goes
 * through a parser rather than trusting the column shape.
 */
function hydrate(row: unknown): Event {
  const ev = row as Event;
  const raw = row as { attendee_fields?: unknown; pinned_fields?: unknown };
  return {
    ...ev,
    attendee_fields: parseAttendeeFields(raw.attendee_fields),
    pinned_fields: hydratePins(raw),
  };
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

/**
 * The event behind a crew link. Looked up by token alone — there is no event id in the URL,
 * and the token is unique across the table for exactly that reason.
 */
export async function getEventByCrewToken(token: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("crew_token", token).maybeSingle();
  return data ? hydrate(data) : null;
}

/**
 * Mints a crew token, or replaces the one there. Rotation IS the revocation mechanism (D108):
 * every copy of the previous link — in a group chat, in a screenshot, on somebody's home screen —
 * stops working the moment this returns.
 */
export async function rotateCrewToken(eventId: string): Promise<string> {
  const crew_token = generateToken();
  await updateEvent(eventId, { crew_token });
  return crew_token;
}

/** Memoised per request, like requireAdmin: the event layout and the page below it both load it. */
export const requireEvent = cache(async (id: string, orgId: string): Promise<Event> => {
  const ev = await getEvent(id);
  if (!ev || ev.org_id !== orgId) notFound();
  return ev;
});

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
