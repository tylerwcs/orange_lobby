import "server-only";
import { cache } from "react";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import { mergeExtra } from "@/lib/attendee-merge";
import { buildAttendeeSearchFilter, isSearchable } from "@/lib/search-filter";
import type { Attendee, AttendeeSource, Event } from "@/lib/types";

export type AttendeeInput = {
  name: string; email?: string | null; phone?: string | null; company?: string | null;
  category?: string | null; table_no?: string | null; extra?: Record<string, string>;
};

export async function findByToken(eventId: string, token: string): Promise<Attendee | null> {
  const { data } = await serviceClient().from("attendees").select("*").eq("event_id", eventId).eq("token", token).maybeSingle();
  return (data as Attendee) ?? null;
}

export async function findByEmail(eventId: string, email: string): Promise<Attendee | null> {
  const { data } = await serviceClient().from("attendees").select("*").eq("event_id", eventId).eq("email", email.trim().toLowerCase()).maybeSingle();
  return (data as Attendee) ?? null;
}

export async function getAttendee(id: string): Promise<Attendee | null> {
  const { data } = await serviceClient().from("attendees").select("*").eq("id", id).maybeSingle();
  return (data as Attendee) ?? null;
}

export async function listAttendees(eventId: string, q?: string): Promise<Attendee[]> {
  let query = serviceClient().from("attendees").select("*").eq("event_id", eventId).order("name");
  if (q && isSearchable(q)) query = query.or(buildAttendeeSearchFilter(q));
  const { data, error } = await query.limit(2000);
  if (error) throw error;
  return data as Attendee[];
}

/** Memoised per request — read by both the page and the summary boundary inside it. */
export const countAttendees = cache(async (eventId: string): Promise<number> => {
  const { count } = await serviceClient().from("attendees").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  return count ?? 0;
});

export async function createAttendee(event: Pick<Event, "id" | "org_id">, input: AttendeeInput, source: AttendeeSource): Promise<Attendee> {
  const { data, error } = await serviceClient().from("attendees")
    .insert({ org_id: event.org_id, event_id: event.id, token: generateToken(), source, extra: {}, ...input, email: input.email?.trim().toLowerCase() || null })
    .select("*").single();
  if (error) throw error;
  return data as Attendee;
}

const INSERT_CHUNK = 200;

/** Bulk-inserts attendees (one round trip per 200 rows) and returns how many were inserted. */
export async function createAttendees(event: Pick<Event, "id" | "org_id">, inputs: AttendeeInput[], source: AttendeeSource): Promise<number> {
  if (inputs.length === 0) return 0;
  const db = serviceClient();
  const rows = inputs.map((input) => ({
    org_id: event.org_id, event_id: event.id, token: generateToken(), source, extra: {},
    ...input, email: input.email?.trim().toLowerCase() || null,
  }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await db.from("attendees").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  return inserted;
}

export async function updateAttendee(id: string, patch: Partial<AttendeeInput>): Promise<void> {
  const { error } = await serviceClient().from("attendees")
    .update({ ...patch, email: patch.email === undefined ? undefined : patch.email?.toLowerCase() ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Insert or, if an attendee with this email exists for the event, update it. Returns the attendee and whether it was new. */
export async function upsertByEmail(event: Pick<Event, "id" | "org_id">, input: AttendeeInput & { email: string }, source: AttendeeSource) {
  const existing = await findByEmail(event.id, input.email);
  if (existing) {
    const extra = mergeExtra(existing.extra, input.extra);
    await updateAttendee(existing.id, { ...input, extra });
    return { attendee: { ...existing, ...input, email: input.email.toLowerCase(), extra } as Attendee, created: false };
  }
  return { attendee: await createAttendee(event, input, source), created: true };
}

/**
 * Rotates one attendee's token, invalidating the QR already printed on their badge.
 * No admin control points here any more — it was one confirm dialog away from the QR you
 * had just handed someone. It stays because it is the only answer to a leaked link, and
 * because `purgeAttendeePersonalData` rotates every token the same way.
 */
export async function regenerateToken(id: string): Promise<string> {
  const token = generateToken();
  const { error } = await serviceClient().from("attendees").update({ token, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return token;
}

export async function deleteAttendee(id: string): Promise<void> {
  const { error } = await serviceClient().from("attendees").delete().eq("id", id);
  if (error) throw error;
}

export async function purgeAttendeePersonalData(eventId: string): Promise<number> {
  const db = serviceClient();
  const { data, error: selectError } = await db.from("attendees").select("id").eq("event_id", eventId);
  if (selectError) throw selectError;
  for (const row of data ?? []) {
    const { error } = await db.from("attendees").update({ name: "Purged", email: null, phone: null, company: null, extra: {}, token: generateToken(), status: "purged", updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw error;
  }
  return data?.length ?? 0;
}
