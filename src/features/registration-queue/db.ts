import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import { generateToken } from "@/lib/tokens";
import { dropBlankAnswers } from "@/lib/registration";
import { PRIVACY_UPDATED } from "@/lib/privacy";
import type { Event, RegistrationEntry } from "@/lib/types";

/** D677, D697: how full the event is. `taken` = active form registrations + pending entries; `full` follows D691. */
export type Places = { taken: number; waiting: number; pending: number; limit: number | null; full: boolean; open: boolean };

/** One entry a fill, move-in, approve, decline or leave changed. `pending` rows are not messaged (D700, D701). */
export type Moved = { entryId: string; attendeeId: string | null; newState: "pending" | "registered" };

export type RegisterOutcome = {
  outcome: "updated" | "waiting" | "pending" | "registered";
  token: string;
  attendeeId: string | null;
  /** Null for a direct registration with no entry behind it (no limit, approval off) and for `updated`. */
  entryId: string | null;
  /** 1-based place on the waiting list; null unless waiting. */
  position: number | null;
};

type MovedRow = { entry_id: string; attendee_id: string | null; new_state: "pending" | "registered" };
const toMoved = (rows: MovedRow[] | null): Moved[] =>
  (rows ?? []).map((r) => ({ entryId: r.entry_id, attendeeId: r.attendee_id, newState: r.new_state }));

/** D677: the event's counts and its full/open flags, read in one call (`registration_places`). */
export async function getPlaces(eventId: string): Promise<Places> {
  const { data, error } = await serviceClient().rpc("registration_places", { p_event_id: eventId });
  if (error) throw error;
  const row = (data as { taken: number; waiting: number; pending: number; lim: number | null; full_: boolean; open_: boolean }[] | null)?.[0];
  if (!row) throw new Error(`getPlaces: no event ${eventId}`);
  return { taken: row.taken, waiting: row.waiting, pending: row.pending, limit: row.lim, full: row.full_, open: row.open_ };
}

/**
 * The registration form's one write (`register_or_queue`): updates an active attendee, or registers,
 * queues (D691) or holds for approval (D697) a new one, all under the event lock. `extra` has its
 * blank answers dropped here, so a returning person's blanks never overwrite what they gave before.
 * A token clash on a brand-new person is retried with a fresh token.
 */
export async function registerOrQueue(
  ev: Pick<Event, "id">,
  input: { name: string; email: string; extra: Record<string, string> },
  opts: { terms: boolean },
): Promise<RegisterOutcome> {
  const db = serviceClient();
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await db.rpc("register_or_queue", {
      p_event_id: ev.id,
      p_name: input.name,
      p_email: input.email,
      p_extra: dropBlankAnswers(input.extra),
      p_new_token: generateToken(),
      p_consent_notice: PRIVACY_UPDATED,
      p_terms: opts.terms,
    });
    if (error) {
      if (error.code === "23505" && attempt < 3) continue; // a generated token already in use
      throw error;
    }
    const row = (data as { outcome: RegisterOutcome["outcome"]; token: string; attendee_id: string | null; entry_id: string | null; position: number | null }[] | null)?.[0];
    if (!row) throw new Error("registerOrQueue: no row returned");
    return { outcome: row.outcome, token: row.token, attendeeId: row.attendee_id, entryId: row.entry_id, position: row.position };
  }
}

/** D682: moves waiting people in while places are free and registration is open (`fill_free_places`). Call after anything that frees a place or raises the limit. */
export async function fillFreePlaces(eventId: string): Promise<Moved[]> {
  const { data, error } = await serviceClient().rpc("fill_free_places", { p_event_id: eventId });
  if (error) throw error;
  return toMoved(data as MovedRow[] | null);
}

/** D685: the organiser's Move in, ignoring the limit. Empty if the entry was not waiting or the person was already active. */
export async function moveInEntry(entryId: string): Promise<Moved[]> {
  const { data, error } = await serviceClient().rpc("move_in_entry", { p_entry_id: entryId });
  if (error) throw error;
  return toMoved(data as MovedRow[] | null);
}

/** D699: Approve, pending to registered. The one row, or empty if the entry was not pending or the person was already active (nobody to message). */
export async function approveEntry(entryId: string): Promise<Moved[]> {
  const { data, error } = await serviceClient().rpc("approve_entry", { p_entry_id: entryId });
  if (error) throw error;
  return ((data as { attendee_id: string }[] | null) ?? []).map((r) => ({ entryId, attendeeId: r.attendee_id, newState: "registered" as const }));
}

/** D700: Decline, pending to declined. Returns whoever the freed place moved. */
export async function declineEntry(entryId: string): Promise<Moved[]> {
  const { data, error } = await serviceClient().rpc("decline_entry", { p_entry_id: entryId });
  if (error) throw error;
  return toMoved(data as MovedRow[] | null);
}

/** D681: the person leaves from their own link. Returns whoever a freed place moved (only a pending person held one). */
export async function leaveEntry(eventId: string, token: string): Promise<Moved[]> {
  const { data, error } = await serviceClient().rpc("leave_entry", { p_event_id: eventId, p_token: token });
  if (error) throw error;
  return toMoved(data as MovedRow[] | null);
}

/** D685: the organiser's Remove, from waiting only. True if it removed the entry. */
export async function removeEntry(entryId: string): Promise<boolean> {
  const { data, error } = await serviceClient().rpc("remove_entry", { p_entry_id: entryId });
  if (error) throw error;
  return data === true;
}

/** D693: an organiser added or imported someone who was waiting or pending. Closes their entry; returns its token, or null if none was open. Does not fill. */
export async function closeEntryForAttendee(eventId: string, email: string, attendeeId: string): Promise<string | null> {
  const { data, error } = await serviceClient().rpc("close_entry_for_attendee", { p_event_id: eventId, p_email: email, p_attendee_id: attendeeId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** An entry by its link, in any state: the waiting page and the "you've left" page both resolve here. */
export async function findEntryByToken(eventId: string, token: string): Promise<RegistrationEntry | null> {
  const { data, error } = await serviceClient().from("registration_entries").select("*").eq("event_id", eventId).eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as RegistrationEntry | null) ?? null;
}

/** Every entry in one state, oldest first (queue order, D679). Paged (D401). */
export async function listEntries(eventId: string, state: "waiting" | "pending"): Promise<RegistrationEntry[]> {
  return selectAll<RegistrationEntry>((from, to) => serviceClient().from("registration_entries").select("*")
    .eq("event_id", eventId).eq("state", state).order("joined_at").order("id").range(from, to));
}

export async function countEntries(eventId: string, state: "waiting" | "pending"): Promise<number> {
  const { count, error } = await serviceClient().from("registration_entries").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).eq("state", state);
  if (error) throw error;
  return count ?? 0;
}

/** D680: the entry's 1-based place on the waiting list; null unless it is waiting. */
export async function waitingPosition(entry: Pick<RegistrationEntry, "id" | "state">): Promise<number | null> {
  if (entry.state !== "waiting") return null;
  const { data, error } = await serviceClient().rpc("registration_entry_position", { p_entry_id: entry.id });
  if (error) throw error;
  return (data as number | null) ?? null;
}

/** One entry by id, in any state; the organiser's row actions check it belongs to their event. */
export async function getEntry(entryId: string): Promise<RegistrationEntry | null> {
  const { data, error } = await serviceClient().from("registration_entries").select("*").eq("id", entryId).maybeSingle();
  if (error) throw error;
  return (data as RegistrationEntry | null) ?? null;
}

/** D693: everyone waiting or pending, by lower-cased email, so Add attendee and the import can give them their link's token. */
export async function openEntriesByEmail(eventId: string): Promise<Map<string, RegistrationEntry>> {
  const rows = await selectAll<RegistrationEntry>((from, to) => serviceClient().from("registration_entries").select("*")
    .eq("event_id", eventId).in("state", ["waiting", "pending"]).order("id").range(from, to));
  return new Map(rows.map((r) => [r.email.toLowerCase(), r]));
}

/** The names behind a fill's rows, for the organiser's flash. */
export async function entryNames(entryIds: string[]): Promise<Map<string, string>> {
  if (entryIds.length === 0) return new Map();
  const { data, error } = await serviceClient().from("registration_entries").select("id, name").in("id", entryIds);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
}
