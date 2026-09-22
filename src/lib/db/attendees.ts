import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken, freshTokens } from "@/lib/tokens";
import { mergeExtra } from "@/lib/attendee-merge";
import { dropBlankAnswers } from "@/lib/registration";
import { buildAttendeeSearchFilter, buildNameSearchFilter, isSearchable } from "@/lib/search-filter";
import { filePathsForEvent } from "@/lib/db/forms";
import { deleteSubmissionFiles } from "@/lib/db/media";
import type { Attendee, AttendeeSource, Event } from "@/lib/types";

export type AttendeeInput = {
  name: string; email?: string | null; category?: string | null; extra?: Record<string, string>;
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

/**
 * `scope` exists because the booth scanner and the crew scanner cannot share one filter: a
 * booth is an unauthenticated, post-event-third-party route, so its search must not be able
 * to use email or company as an inference channel (D98, D99), while the crew door
 * legitimately needs to find someone by the email they registered with.
 */
export async function listAttendees(eventId: string, q?: string, scope: "wide" | "name" = "wide"): Promise<Attendee[]> {
  let query = serviceClient().from("attendees").select("*").eq("event_id", eventId).order("name");
  if (q && isSearchable(q)) query = query.or(scope === "name" ? buildNameSearchFilter(q) : buildAttendeeSearchFilter(q));
  const { data, error } = await query.limit(2000);
  if (error) throw error;
  return data as Attendee[];
}

export async function countAttendees(eventId: string): Promise<number> {
  const { count } = await serviceClient().from("attendees").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  return count ?? 0;
}

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
    // A blank answer never erases a value already on file: an upsert is how a
    // re-registration and a walk-in both arrive, and neither is a reason to drop what
    // the masterlist supplied.
    const extra = mergeExtra(existing.extra, dropBlankAnswers(input.extra ?? {}));
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

/**
 * Anonymises every attendee of one event, irreversibly: names replaced, emails and seats
 * cleared, every registration answer dropped, and every personal link reissued so the old
 * ones stop working. Every form submission for the event is dropped too, uploaded files
 * included (D169) — the rows themselves stay, so attendance and booking counts survive —
 * which is what the purge card promises, and why `category` is deliberately left alone
 * (D173).
 *
 * One statement, in a database function (D172). It used to be a loop of one UPDATE per
 * attendee, and supabase-js has no transaction, so a failure partway left an event half
 * purged with nothing to say so. Tokens are minted here rather than in SQL so
 * `TOKEN_ALPHABET` stays the only definition of what a token looks like.
 *
 * A few spare tokens are sent because the count and the update are separate statements: an
 * attendee created in between would otherwise be handed a NULL token and roll the purge
 * back. The slack makes that vanishingly unlikely, and the function still refuses loudly
 * rather than purging some of them.
 *
 * Uploaded files go first, and from here rather than from the SQL function: Storage is not
 * reachable from plpgsql. First is deliberate, not incidental. If the RPC ran first and the
 * file deletion afterwards then failed, the database would already say "purged" while orphaned
 * files sat in the bucket with no `form_submissions` row left to name them by — a half-purged
 * event with no way even to notice, let alone retry. Doing the files first means a failure
 * here throws before the RPC is ever called: the database stays exactly as it was, the
 * organiser sees an error instead of a false "Personal data purged", and retrying is safe
 * because a path already removed from the bucket is simply not found again.
 */
export async function purgeAttendeePersonalData(eventId: string): Promise<number> {
  const db = serviceClient();
  await deleteSubmissionFiles(await filePathsForEvent(eventId));
  const { count, error: countError } = await db
    .from("attendees").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (countError) throw countError;
  const { data, error } = await db.rpc("purge_event_personal_data", {
    p_event_id: eventId,
    p_tokens: freshTokens((count ?? 0) + 8),
  });
  if (error) throw error;
  return data ?? 0;
}

/**
 * The categories this event's attendees actually have, for the agenda form's toggles.
 *
 * One column rather than whole rows: the agenda page needs the names, not the people, and
 * it renders on every event whether or not it runs breakouts.
 */
export async function listCategories(eventId: string): Promise<string[]> {
  const { data, error } = await serviceClient().from("attendees").select("category").eq("event_id", eventId);
  if (error) throw error;
  const seen = new Set<string>();
  for (const r of (data ?? []) as { category: string | null }[]) {
    const c = r.category?.trim();
    if (c) seen.add(c);
  }
  return [...seen].sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
}
