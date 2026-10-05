import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Attendee, Event, EventGroup } from "@/lib/types";
import { entryCountsFrom } from "@/lib/groups";

/**
 * A name the admin has to change (D345): blank, too long, or already held in this event,
 * ignoring case. The message is the flash; every other error is a real failure.
 */
export class GroupNameRefused extends Error {}

const cleanName = (name: string) => {
  const n = name.trim();
  if (!n) throw new GroupNameRefused("A group needs a name.");
  if (n.length > 80) throw new GroupNameRefused("Keep a group's name to 80 characters or fewer.");
  return n;
};
const taken = (n: string) => new GroupNameRefused(`There is already a group called "${n}".`);

export async function listGroups(eventId: string): Promise<EventGroup[]> {
  const { data, error } = await serviceClient().from("event_groups").select("*").eq("event_id", eventId).order("name");
  if (error) throw error;
  return (data ?? []) as EventGroup[];
}

export async function getGroup(eventId: string, groupId: string): Promise<EventGroup | null> {
  const { data, error } = await serviceClient().from("event_groups").select("*").eq("event_id", eventId).eq("id", groupId).maybeSingle();
  if (error) throw error;
  return data as EventGroup | null;
}

export async function createGroup(ev: Pick<Event, "id" | "org_id">, name: string): Promise<EventGroup> {
  const n = cleanName(name);
  const { data, error } = await serviceClient().from("event_groups").insert({ org_id: ev.org_id, event_id: ev.id, name: n }).select("*").single();
  if (error?.code === "23505") throw taken(n);
  if (error) throw error;
  return data as EventGroup;
}

/** Several at once, for Build from column (D347). Names are already distinct ignoring case. */
export async function createGroups(ev: Pick<Event, "id" | "org_id">, names: string[]): Promise<EventGroup[]> {
  if (names.length === 0) return [];
  const { data, error } = await serviceClient().from("event_groups")
    .insert(names.map((n) => ({ org_id: ev.org_id, event_id: ev.id, name: cleanName(n) }))).select("*");
  if (error?.code === "23505") throw new GroupNameRefused("Another admin just made one of these groups. Preview again.");
  if (error) throw error;
  return (data ?? []) as EventGroup[];
}

export async function renameGroup(eventId: string, groupId: string, name: string): Promise<void> {
  const n = cleanName(name);
  const { error } = await serviceClient().from("event_groups").update({ name: n }).eq("event_id", eventId).eq("id", groupId);
  if (error?.code === "23505") throw taken(n);
  if (error) throw error;
}

/** D349: the foreign keys null the members' and the entries' group_id; nothing else goes. */
export async function deleteGroup(eventId: string, groupId: string): Promise<void> {
  const { error } = await serviceClient().from("event_groups").delete().eq("event_id", eventId).eq("id", groupId);
  if (error) throw error;
}

export async function groupMembers(eventId: string, groupId: string): Promise<Attendee[]> {
  const { data, error } = await serviceClient().from("attendees").select("*").eq("event_id", eventId).eq("group_id", groupId).order("name");
  if (error) throw error;
  return (data ?? []) as Attendee[];
}

const ID_CHUNK = 100;

/**
 * Puts these attendees in `groupId`, or out of any group with null (D344: one column, so moving
 * is one write). Scoped by event: an id from another event matches nothing, and the composite
 * foreign key refuses a group from another event outright.
 *
 * F6: `onlyFrom`, when given, also requires `group_id = onlyFrom` — a remove acts on stale data
 * otherwise: from a page that has not seen a since-happened move, it would pull someone out of
 * the group they are actually in now, not the one the page still shows them in.
 */
export async function setGroupMembers(eventId: string, attendeeIds: string[], groupId: string | null, onlyFrom?: string): Promise<void> {
  const ids = [...new Set(attendeeIds)];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    let q = serviceClient().from("attendees")
      .update({ group_id: groupId, updated_at: new Date().toISOString() })
      .eq("event_id", eventId).in("id", ids.slice(i, i + ID_CHUNK));
    if (onlyFrom) q = q.eq("group_id", onlyFrom);
    const { error } = await q;
    if (error) throw error;
  }
}

/** For the delete confirmation (D349): live entries that will show under "Deleted group". */
export async function liveGroupEntryCount(eventId: string, groupId: string): Promise<number> {
  const { count, error } = await serviceClient().from("activity_submissions").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).eq("group_id", groupId).eq("status", "submitted");
  if (error) throw error;
  return count ?? 0;
}

/**
 * F5: the same count as `liveGroupEntryCount`, for every group in one query rather than one per
 * row — what the Groups list wants, and `liveGroupEntryCount` stays for the single group a
 * delete confirmation asks about.
 *
 * D400: counted in the database (`live_entry_counts_by_group`, migration 0065), one row per
 * group. Fetching one row per entry and counting here stopped at PostgREST's 1,000-row cap.
 */
export async function liveEntryCountsByGroup(eventId: string): Promise<Map<string, number>> {
  const { data, error } = await serviceClient().rpc("live_entry_counts_by_group", { p_event_id: eventId });
  if (error) throw error;
  return entryCountsFrom(data as { group_id: string; entries: number | string }[] | null);
}
