import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import type { Actor } from "@/lib/access";
import type { AttendeeChange, ChangeKind, NewChange, PersonChange } from "./types";
import { searchPattern, searchText } from "./lib/changes";
import { KIND_GROUPS } from "./lib/kinds";

/**
 * The attendee log's reads and writes (D742). The table is service-role only, so everything
 * here goes through `serviceClient()`; who may call these is the caller's gate, not this file's.
 */

/** The name the log shows for whoever acted: a committee member's own name, else their email. */
async function actorName(eventId: string, by: Actor): Promise<string> {
  if (by.kind !== "committee") return by.email;
  const { data, error } = await serviceClient().from("event_committee")
    .select("name").eq("event_id", eventId).eq("user_id", by.userId)
    .order("added_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const name = ((data?.name as string | undefined) ?? "").trim();
  return name || by.email;
}

/** Writes one change row. A null change (nothing actually changed) is a no-op. Throws on error. */
export async function recordChange(eventId: string, by: Actor, change: NewChange | null): Promise<void> {
  if (!change) return;
  const name = await actorName(eventId, by);
  const { error } = await serviceClient().from("attendee_changes").insert({
    event_id: eventId,
    actor_user_id: by.userId,
    actor_email: by.email,
    actor_name: name,
    actor_kind: by.kind,
    kind: change.kind,
    summary: change.summary,
    attendee_ids: [...new Set(change.people.map((p) => p.attendeeId))],
    search: searchText(change, name, by.email),
    detail: { people: change.people },
  });
  if (error) throw error;
}

type Row = {
  id: string; at: string; actor_email: string; actor_name: string; actor_kind: "admin" | "committee";
  kind: string; summary: string; detail: { people?: PersonChange[] } | null;
};

/** Newest first. `page` is 1-based. `q` matches the summary, the actor and the people involved. */
export async function listChanges(
  eventId: string,
  f: { q?: string; by?: string; group?: keyof typeof KIND_GROUPS },
  page: number,
  pageSize: number,
): Promise<{ rows: AttendeeChange[]; total: number }> {
  let query = serviceClient().from("attendee_changes")
    .select("id, at, actor_email, actor_name, actor_kind, kind, summary, detail", { count: "exact" })
    .eq("event_id", eventId);
  const q = f.q?.trim();
  if (q) query = query.or(`search.ilike."%${searchPattern(q)}%"`);
  if (f.by) query = query.eq("actor_email", f.by);
  if (f.group && KIND_GROUPS[f.group]) query = query.in("kind", KIND_GROUPS[f.group]);
  const from = (Math.max(1, Math.floor(page)) - 1) * pageSize;
  const { data, error, count } = await query
    .order("at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  const rows = ((data ?? []) as Row[]).map((r): AttendeeChange => ({
    id: r.id,
    at: r.at,
    actorName: r.actor_name,
    actorEmail: r.actor_email,
    actorKind: r.actor_kind,
    kind: r.kind as ChangeKind,
    summary: r.summary,
    people: r.detail?.people ?? [],
  }));
  return { rows, total: count ?? 0 };
}

/** How many changes the event's log holds, without fetching a row. */
export async function countChanges(eventId: string): Promise<number> {
  const { count, error } = await serviceClient().from("attendee_changes")
    .select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (error) throw error;
  return count ?? 0;
}

/** Everyone who has made a change at this event, once each, by name: the "done by" filter's choices. */
export async function listChangeActors(eventId: string): Promise<{ email: string; name: string; kind: "admin" | "committee" }[]> {
  const rows = await selectAll<{ actor_email: string; actor_name: string; actor_kind: "admin" | "committee" }>((from, to) =>
    serviceClient().from("attendee_changes").select("actor_email, actor_name, actor_kind")
      .eq("event_id", eventId).order("at", { ascending: false }).order("id").range(from, to));
  // Newest first, so the first sighting of an email carries the name they use now.
  const seen = new Map<string, { email: string; name: string; kind: "admin" | "committee" }>();
  for (const r of rows) {
    if (!seen.has(r.actor_email)) seen.set(r.actor_email, { email: r.actor_email, name: r.actor_name, kind: r.actor_kind });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The event's whole log. Called when its personal data is purged. */
export async function deleteChangesForEvent(eventId: string): Promise<void> {
  const { error } = await serviceClient().from("attendee_changes").delete().eq("event_id", eventId);
  if (error) throw error;
}
