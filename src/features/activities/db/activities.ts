import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import type { RegistrationQuestion, GroupMode, ChallengeScoring } from "@/lib/types";
import type { Activity, ActivityBooking, ActivityKind, ActivitySession, ActivitySubmission, Event } from "@/lib/types";
import type { PairCode, PairWho } from "../lib/pairs";
import type { ScheduleResult } from "../lib/schedule";

export type NewActivity = {
  name: string;
  description: string | null;
  kind: ActivityKind;
  required: boolean;
  is_open: boolean;
  /** D600. Left out, the column's null stands; only the schedule actions and the Open switch write it (D602). */
  opens_at?: string | null;
  /** Null is no cap at all (D178). */
  max_per_attendee: number | null;
  categories: string[] | null;
  /** Empty on a booking activity. */
  questions: RegistrationQuestion[];
  per_day: boolean;
  /** Submission kind only (D350). Left out, the column's 'off' stands. */
  group_mode?: GroupMode;
  group_target?: number | null;
  /** Submission kind only (D372). Left out, the column's null stands. */
  scoring?: ChallengeScoring | null;
  /** Left out, the column's null stands - as for the four submission details below. */
  image_url?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  venue?: string | null;
  action_label?: string | null;
  /** Passport kind only (D182). Left out, the column's null stands. */
  stamps_required?: number | null;
  reward_message?: string | null;
  /** D387. Left out, the column's false stands; `togglePinAction` alone flips it. */
  pinned?: boolean;
  /** Submission kind only (D391). Left out, the column's false stands. */
  attendee_edit?: boolean;
  /** Submission kind only (D392). Left out, the column's empty list stands. */
  proxy_fields?: string[];
  /** Submission kind only (D412). Left out, the column's false stands. */
  health_data?: boolean;
  /** Submission kind only (D524). Left out, the column's false stands. */
  allow_pair?: boolean;
  /** D397. Left out, the column's true stands; `toggleLeaderboardAction` alone flips it. */
  show_leaderboard?: boolean;
  /** Polaroid kind only (D474, D475). Left out, the columns' nulls stand. */
  wall_token?: string | null;
  public_token?: string | null;
  polaroid?: Record<string, unknown> | null;
  /** Tournament kind only (D640, D641). Left out, the columns' nulls stand. */
  squads_close_at?: string | null;
  squad_fill?: "captains" | "self" | null;
};

export type NewSession = {
  day: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  capacity: number;
};

/** Every answer `book_session` can give (D140). `missing` means the row is gone or foreign. */
export type BookResult = "ok" | "full" | "closed" | "limit" | "ineligible" | "missing";

/**
 * Every activity of the event.
 *
 * Task 7 calls this on every personal portal load, before anything else has confirmed
 * migration 0016 is applied. A rollback, a fresh environment, or a deploy that lands before
 * the migration all leave the tables missing while this code is already live, and PostgREST
 * answers a query against an unknown relation with PGRST205 (table not in the schema cache) —
 * or, if the raw Postgres error surfaces instead of PostgREST's translation of it, 42P01
 * (undefined_table). Either way the portal has nothing to show, not an error to raise, so this
 * is treated as "no activities" rather than a 500 for every attendee mid-event. Every other
 * function in this module still throws on any error — this is the only one that tolerates a
 * missing relation. They are NOT unreachable without the migration: the personal activities
 * page (`src/app/e/[slug]/(portal)/a/[token]/activities/page.tsx`) calls `listSessions`,
 * `countBookingsBySession`, and `bookingsForAttendee` alongside this one in a single unguarded
 * `Promise.all`, so that page assumes migration 0016 has already run and will 500 rather than
 * degrade if it has not. Only the callers that call this function first and gate the rest of
 * their queries on `activities.length` earn the graceful path — `loadHomeData` and the
 * personal agenda page both do this; a caller added later has to do the same, deliberately,
 * rather than inherit it for free.
 */
export async function listActivities(eventId: string, kind?: ActivityKind): Promise<Activity[]> {
  let q = serviceClient().from("activities").select("*").eq("event_id", eventId);
  // One table, two kinds (D178), so most callers want one of them — a booking page listing
  // submission activities would offer sessions to something that has none.
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q.order("sort_order").order("created_at");
  if (error?.code === "PGRST205" || error?.code === "42P01") return [];
  if (error) throw error;
  return data as Activity[];
}

export async function getActivity(id: string, eventId: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*")
    .eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

/** Appends to the end: a new activity is the next one, not the first. Returns its id. */
export async function createActivity(event: Pick<Event, "id" | "org_id">, input: NewActivity): Promise<string> {
  const db = serviceClient();
  const { data: last } = await db.from("activities").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("activities")
    .insert({ org_id: event.org_id, event_id: event.id, ...input, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateActivity(id: string, eventId: string, patch: Partial<NewActivity>): Promise<void> {
  const { error } = await serviceClient().from("activities").update(patch)
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/**
 * D611: sets when a closed activity opens, in one statement that re-checks it is still closed
 * and its event not archived - so the timer opening it a moment earlier comes back as 'open',
 * not as the check-constraint error a plain `updateActivity` would throw.
 */
export async function scheduleOpening(activityId: string, eventId: string, at: string): Promise<ScheduleResult> {
  const { data, error } = await serviceClient().rpc("schedule_opening", {
    p_activity_id: activityId, p_event_id: eventId, p_at: at,
  });
  if (error) throw error;
  return data as ScheduleResult;
}

/** Cascades its sessions and bookings, or its submissions, depending on kind (D135, D178). */
export async function deleteActivity(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("activities").delete()
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/**
 * Deletes a passport only while nobody has been stamped on it (D188). The cascade to `booths`
 * meets `booth_stamps.booth_id ... on delete restrict`, so the database refuses (23503) once
 * any stamp exists — atomically, the same way `deleteBoothIfUnstamped` relies on it for one
 * booth. Returns false when refused, or when nothing matched.
 */
export async function deletePassportIfUnstamped(id: string, eventId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activities").delete()
    .eq("id", id).eq("event_id", eventId).eq("kind", "passport").select("id");
  if (error?.code === "23503") return false;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Every session of the event. `time` comes back as HH:MM:SS, so it is trimmed as listAgenda does. */
export async function listSessions(eventId: string): Promise<ActivitySession[]> {
  const { data, error } = await serviceClient().from("activity_sessions").select("*")
    .eq("event_id", eventId).order("day").order("starts_at").order("sort_order");
  if (error) throw error;
  return (data as ActivitySession[]).map((s) => ({
    ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at?.slice(0, 5) ?? null,
  }));
}

/** One activity's sessions on one day: what a booking door covers (D325). Trimmed and ordered as `listSessions`. */
export async function listSessionsOn(activityId: string, day: string): Promise<ActivitySession[]> {
  const { data, error } = await serviceClient().from("activity_sessions").select("*")
    .eq("activity_id", activityId).eq("day", day).order("starts_at").order("sort_order");
  if (error) throw error;
  return (data as ActivitySession[]).map((s) => ({
    ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at?.slice(0, 5) ?? null,
  }));
}

/** One insert for a whole batch (D241): it all lands or none of it does. `sort_order` only breaks ties between sessions starting together, so it continues from the last. */
export async function createSessions(eventId: string, activityId: string, inputs: NewSession[]): Promise<void> {
  if (inputs.length === 0) return;
  const db = serviceClient();
  const { data: last } = await db.from("activity_sessions").select("sort_order")
    .eq("activity_id", activityId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const start = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("activity_sessions")
    .insert(inputs.map((input, i) => ({ event_id: eventId, activity_id: activityId, ...input, sort_order: start + i })));
  if (error) throw error;
}

/**
 * Edits one session. Sends every column including nulls, so clearing an end time or a
 * location actually clears it.
 *
 * This deliberately cannot move a session to another activity. `activity_bookings.activity_id`
 * is denormalised from the session (D124), so a move has to rewrite every booking on that
 * session in the same breath — and nothing in the admin offers a move, so the safe answer is
 * that this path does not do it. If a move is ever added, it belongs in a function of its own
 * that updates both tables, with a test that proves the bookings followed.
 */
export async function updateSession(id: string, eventId: string, patch: NewSession): Promise<void> {
  const { error } = await serviceClient().from("activity_sessions").update(patch)
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteSession(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("activity_sessions").delete()
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Every session of one activity on one day (D242). Bookings cascade, as with a single session (D135). */
export async function deleteSessionsOnDay(eventId: string, activityId: string, day: string): Promise<number> {
  const { data, error } = await serviceClient().from("activity_sessions").delete()
    .eq("event_id", eventId).eq("activity_id", activityId).eq("day", day).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Every booking of the event. Paged (D289): it decides seat counts, door tallies and the
 * Bookings tab's marks, and an event where everyone books a few sessions passes 1,000 rows.
 * Ordered by id only so the pages neither overlap nor skip; it means nothing else.
 */
export async function listBookings(eventId: string): Promise<ActivityBooking[]> {
  return selectAll<ActivityBooking>((from, to) => serviceClient().from("activity_bookings")
    .select("*").eq("event_id", eventId).order("id").range(from, to));
}

/**
 * The bookings of these sessions only: one booking door's bookers, without the event's whole
 * table. Paged like `listBookings`, since a door is only as small as its sessions' capacity.
 */
export async function listBookingsForSessions(sessionIds: string[]): Promise<ActivityBooking[]> {
  if (sessionIds.length === 0) return [];
  return selectAll<ActivityBooking>((from, to) => serviceClient().from("activity_bookings")
    .select("*").in("session_id", sessionIds).order("id").range(from, to));
}

export async function countBookingsBySession(eventId: string): Promise<Record<string, number>> {
  const rows = await listBookings(eventId);
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.session_id] = (acc[r.session_id] ?? 0) + 1;
    return acc;
  }, {});
}

/** One attendee's bookings. The portal's hot path — one query, one attendee. */
export async function bookingsForAttendee(attendeeId: string): Promise<ActivityBooking[]> {
  const { data, error } = await serviceClient().from("activity_bookings").select("*")
    .eq("attendee_id", attendeeId);
  if (error) throw error;
  return (data ?? []) as ActivityBooking[];
}

/**
 * The session one attendee booked of an activity on one day, or null (D326). Two small
 * queries - their bookings of the activity, then which of those sessions fall on the day - so
 * a scan never reads the event's whole booking table.
 */
export async function bookedSessionOn(attendeeId: string, activityId: string, day: string): Promise<ActivitySession | null> {
  const db = serviceClient();
  const { data: rows, error } = await db.from("activity_bookings").select("session_id")
    .eq("attendee_id", attendeeId).eq("activity_id", activityId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.session_id as string);
  if (ids.length === 0) return null;
  const { data, error: e2 } = await db.from("activity_sessions").select("*")
    .in("id", ids).eq("day", day).order("starts_at").limit(1).maybeSingle();
  if (e2) throw e2;
  if (!data) return null;
  const s = data as ActivitySession;
  return { ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at?.slice(0, 5) ?? null };
}

/** Everyone booked into an activity on one day: who a booking door expects (D324). */
export async function bookerIdsOn(activityId: string, day: string): Promise<Set<string>> {
  const db = serviceClient();
  const { data: sessions, error } = await db.from("activity_sessions").select("id")
    .eq("activity_id", activityId).eq("day", day);
  if (error) throw error;
  const ids = (sessions ?? []).map((s) => s.id as string);
  if (ids.length === 0) return new Set();
  // Paged (D401): a whole-event dinner can hold more than 1,000 bookings.
  const rows = await selectAll<{ attendee_id: string }>((from, to) => db.from("activity_bookings")
    .select("attendee_id").in("session_id", ids).order("id").range(from, to));
  return new Set(rows.map((r) => r.attendee_id));
}

/**
 * The only way a booking is ever created.
 *
 * Capacity, the per-activity cap, open/closed and eligibility are all decided inside the
 * database under a row lock (D125), so nothing above this line may read a count and then
 * insert. `ignoreOpen` is the desk placing somebody while booking is shut (D130); it does
 * not — and must not — bypass capacity.
 */
export async function bookSession(sessionId: string, attendeeId: string, ignoreOpen = false): Promise<BookResult> {
  const { data, error } = await serviceClient().rpc("book_session", {
    p_session_id: sessionId, p_attendee_id: attendeeId, p_ignore_open: ignoreOpen,
  });
  if (error) throw error;
  return data as BookResult;
}

/**
 * Moves one booking to another session of the same activity, atomically.
 *
 * Not a `cancelBooking` followed by a `bookSession`: an attendee in a required activity with a
 * cap of one cannot cancel (D129), and a target that fills between the two steps would leave
 * them holding nothing. The database does both halves in one transaction or neither.
 */
export async function switchSession(
  fromSessionId: string,
  toSessionId: string,
  attendeeId: string,
  ignoreOpen = false,
): Promise<BookResult> {
  const { data, error } = await serviceClient().rpc("switch_session", {
    p_from_session: fromSessionId, p_to_session: toSessionId,
    p_attendee_id: attendeeId, p_ignore_open: ignoreOpen,
  });
  if (error) throw error;
  return data as BookResult;
}

/**
 * Every answer `cancel_booking` can give. `missing` covers both a stale second tab re-cancelling
 * a booking already gone and a session the attendee never held; `required` is the same rule
 * `activityControls.canRequestCancel` decides in the UI, re-enforced under the same row lock
 * `book_session` and `switch_session` use, so the check and the delete cannot be pulled apart by
 * two overlapping requests the way an app-side read-then-delete could be.
 */
export type CancelResult = "ok" | "missing" | "required";

/**
 * Every answer an approval can get. `switch_session` and `cancel_booking` do not return the
 * same set — only a cancel can be refused as `required`, and only a switch can be `full`,
 * `closed` or `limit` — so the desk's handler must cover the union of both.
 */
export type DecisionResult = BookResult | CancelResult;

/**
 * The only way a booking is ever removed by the attendee themselves.
 *
 * Not a plain `delete`: whether cancelling is even allowed (required activity, one booking
 * left) used to be decided in the app from a count read a moment earlier, which is a
 * check-then-act race the same way an uncontrolled `count` then `insert` would be for capacity.
 * `cancel_booking` locks the session row and re-derives the held count itself before deciding.
 */
export async function cancelBooking(sessionId: string, attendeeId: string): Promise<CancelResult> {
  const { data, error } = await serviceClient().rpc("cancel_booking", {
    p_session_id: sessionId, p_attendee_id: attendeeId,
  });
  if (error) throw error;
  return data as CancelResult;
}

// ---- Submissions: the other kind's child table (D178) ----

/** Every answer `submit_answers` can give. Mirrors BookResult; `today` replaces `full`. */
/** D392 adds `proxy`: the sender may not submit for that member. */
export type SubmitCode = "ok" | "missing" | "closed" | "ineligible" | "notrack" | "othertrack" | "trackfull" | "limit" | "today" | "nogroup" | "groupdone" | "proxy" | "duplicate";

// revoked rows never count and never reach an attendee's history (D339, D341); they are shown apart, with their reason, via revokedForAttendee (D500).
// Paged (D289): a daily challenge passes 1,000 rows within days, and newest-first would drop the
// OLDEST past the cap. `id` last keeps pages from overlapping or skipping (D383).
export async function listSubmissions(eventId: string): Promise<ActivitySubmission[]> {
  try {
    return await selectAll<ActivitySubmission>((from, to) => serviceClient().from("activity_submissions").select("*")
      .eq("event_id", eventId).eq("status", "submitted")
      .order("submitted_on", { ascending: false }).order("created_at", { ascending: false }).order("id")
      .range(from, to));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "PGRST205" || code === "42P01") return [];
    throw error;
  }
}

// The admin table shows revoked rows too, D340. Paged like `listSubmissions` (D383).
export async function submissionsForActivity(activityId: string): Promise<ActivitySubmission[]> {
  return selectAll<ActivitySubmission>((from, to) => serviceClient().from("activity_submissions").select("*")
    .eq("activity_id", activityId)
    .order("submitted_on", { ascending: false }).order("created_at", { ascending: false }).order("id")
    .range(from, to));
}

// revoked rows never count and never reach an attendee's history (D339, D341); they are shown apart, with their reason, via revokedForAttendee (D500).
export async function submissionsForAttendee(attendeeId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("attendee_id", attendeeId).eq("status", "submitted").order("submitted_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

/**
 * D374: one attendee's entries to one scored activity, revoked ones INCLUDED - the tracker shows a
 * removed workout faded with "Removed by the organiser", where `submissionsForAttendee` hides it.
 */
export async function entriesForAttendee(activityId: string, attendeeId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("activity_id", activityId).eq("attendee_id", attendeeId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

// D353: every member reads the same rows - the group's live entries, whoever sent them.
export async function submissionsForGroup(groupId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("group_id", groupId).eq("status", "submitted").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

/** D500: an attendee's revoked entries, for display beside their history. Never counted (D501). */
export async function revokedForAttendee(attendeeId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("attendee_id", attendeeId).eq("status", "revoked").order("revoked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

/** D500: a group's revoked entries, which every member of a group form sees. */
export async function revokedForGroup(groupId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("group_id", groupId).eq("status", "revoked").order("revoked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

export async function getSubmission(id: string): Promise<ActivitySubmission | null> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ActivitySubmission | null;
}

/**
 * D520: what every edit writes besides the answers. A verifier approved the answer they saw;
 * once it changes, the entry is back in their To check list.
 */
const UNAPPROVED = { approved_at: null, approved_by_verifier: null, approved_by: null };

/**
 * D532/D533: what a write to one entry acts on - both rows of a tagged pair, or just this row.
 * Read fresh per write rather than trusted from the caller's copy of the row.
 */
async function linkedScope(id: string): Promise<{ col: "id" | "pair_id"; val: string }> {
  const { data, error } = await serviceClient().from("activity_submissions").select("pair_id").eq("id", id).maybeSingle();
  if (error) throw error;
  const pair = (data as { pair_id: string | null } | null)?.pair_id ?? null;
  return pair ? { col: "pair_id", val: pair } : { col: "id", val: id };
}

/**
 * D531: for each paired row given, the other row's attendee. A pair whose two rows are both in
 * `rows` (with their `attendee_id`) needs no query; the rest are read together, 100 pair ids at
 * a time and paged, since ids travel in the query string and a result is capped at 1,000 rows.
 */
export async function pairPartnerIds(
  rows: (Pick<ActivitySubmission, "id" | "pair_id"> & Partial<Pick<ActivitySubmission, "attendee_id">>)[],
): Promise<Map<string, string>> {
  type Half = { id: string; attendee_id: string };
  const halves = new Map<string, Half[]>();
  const add = (pair: string, h: Half) => { const l = halves.get(pair); if (l) l.push(h); else halves.set(pair, [h]); };
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.pair_id && r.attendee_id && !seen.has(r.id)) { seen.add(r.id); add(r.pair_id, { id: r.id, attendee_id: r.attendee_id }); }
  }
  const unresolved = [...new Set(rows.flatMap((r) => (r.pair_id && (halves.get(r.pair_id)?.length ?? 0) < 2 ? [r.pair_id] : [])))];
  const PAIR_CHUNK = 100;
  for (let i = 0; i < unresolved.length; i += PAIR_CHUNK) {
    const chunk = unresolved.slice(i, i + PAIR_CHUNK);
    const found = await selectAll<{ id: string; pair_id: string; attendee_id: string }>((from, to) =>
      serviceClient().from("activity_submissions").select("id, pair_id, attendee_id").in("pair_id", chunk).order("id").range(from, to));
    for (const x of found) if (!seen.has(x.id)) { seen.add(x.id); add(x.pair_id, { id: x.id, attendee_id: x.attendee_id }); }
  }
  const out = new Map<string, string>();
  for (const r of rows) {
    const other = r.pair_id ? halves.get(r.pair_id)?.find((h) => h.id !== r.id) : undefined;
    if (other) out.set(r.id, other.attendee_id);
  }
  return out;
}

/**
 * D337. Only a live row can be edited; false when it was revoked or is gone. D520: an edit clears any approval.
 * D532: on a tagged pair the edit lands on both rows.
 */
export async function updateSubmissionAnswers(
  id: string, activityId: string, answers: Record<string, string>, userId: string, fileHashes: Record<string, string>,
): Promise<boolean> {
  const s = await linkedScope(id);
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({ answers, file_hashes: fileHashes, edited_at: new Date().toISOString(), edited_by: userId, ...UNAPPROVED })
    .eq(s.col, s.val).eq("activity_id", activityId).eq("status", "submitted").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * D391: an attendee's edit of their own entry. Every rule `canEditOwn` checked is re-checked in
 * the write itself - their row, still live, sent today - so a revoke or midnight landing between
 * the check and the save wins. False when any of them no longer holds.
 * D532: a pair is written as a whole. Who may edit was checked by `canEditOwn` on a fresh read and
 * the owner never changes, so the owner guard stays only for an unpaired row.
 */
export async function updateOwnSubmissionAnswers(
  id: string, activityId: string, attendeeId: string, today: string, answers: Record<string, string>, fileHashes: Record<string, string>,
): Promise<boolean> {
  const s = await linkedScope(id);
  let q = serviceClient().from("activity_submissions")
    .update({ answers, file_hashes: fileHashes, attendee_edited_at: new Date().toISOString(), ...UNAPPROVED })
    .eq(s.col, s.val).eq("activity_id", activityId);
  if (s.col === "id") q = q.or(`attendee_id.eq.${attendeeId},submitted_by.eq.${attendeeId}`);
  const { data, error } = await q.eq("status", "submitted").eq("submitted_on", today).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * D398: an attendee deletes their own entry - gone for good, row and (by the caller) files. The
 * same rules as `updateOwnSubmissionAnswers`, re-checked in the delete itself. Returns the row it
 * removed, so the caller deletes exactly that row's files; null when any rule no longer holds.
 * D533: a tagged pair goes as a whole; both rows name the same files, so the first removed row
 * is enough for the caller to delete them once.
 */
export async function deleteOwnSubmission(id: string, activityId: string, attendeeId: string, today: string): Promise<ActivitySubmission | null> {
  const s = await linkedScope(id);
  let q = serviceClient().from("activity_submissions").delete().eq(s.col, s.val).eq("activity_id", activityId);
  if (s.col === "id") q = q.or(`attendee_id.eq.${attendeeId},submitted_by.eq.${attendeeId}`);
  const { data, error } = await q.eq("status", "submitted").eq("submitted_on", today).select("*");
  if (error) throw error;
  return (data?.[0] as ActivitySubmission | undefined) ?? null;
}

/** D392: the live entries this attendee sent today for other members of their group, newest first. */
export async function submissionsAddedBy(activityId: string, attendeeId: string, today: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("activity_id", activityId).eq("submitted_by", attendeeId).eq("submitted_on", today).eq("status", "submitted")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

/** D492: an admin (an auth user) or a verifier link; exactly one of the two stamps is set. */
export type RevokedBy = { userId: string } | { verifierId: string };

/**
 * D518: a verifier marks a live, not-yet-approved entry as checked. Guarded in the write, so
 * a revoke or another verifier's approval landing first wins. False when either did.
 * D532: on a tagged pair the approval covers both rows.
 */
export async function approveSubmission(id: string, activityId: string, verifierId: string): Promise<boolean> {
  const s = await linkedScope(id);
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({ approved_at: new Date().toISOString(), approved_by_verifier: verifierId })
    .eq(s.col, s.val).eq("activity_id", activityId).eq("status", "submitted").is("approved_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D521: Undo. Any of the event's verifiers may take an approval back, while the entry is live. D532: both rows of a pair. */
export async function unapproveSubmission(id: string, activityId: string): Promise<boolean> {
  const s = await linkedScope(id);
  const { data, error } = await serviceClient().from("activity_submissions")
    .update(UNAPPROVED)
    .eq(s.col, s.val).eq("activity_id", activityId).eq("status", "submitted").not("approved_at", "is", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * D338. Status, not a delete: the row and its files stay. False when already revoked or gone.
 * D498/D499: always with a reason, stored as the wording itself.
 * D533: revoking one row of a tagged pair revokes both, with the same reason and stamp.
 */
export async function revokeSubmission(id: string, activityId: string, reason: string, by: RevokedBy): Promise<boolean> {
  const s = await linkedScope(id);
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({
      status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: reason,
      revoked_by: "userId" in by ? by.userId : null,
      revoked_by_verifier: "verifierId" in by ? by.verifierId : null,
    })
    .eq(s.col, s.val).eq("activity_id", activityId).eq("status", "submitted").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D735: why `restore_submission` refused; `missing` is gone or no longer revoked. */
export type RestoreCode = "ok" | "missing" | "today" | "limit" | "groupdone" | "trackfull";

/**
 * D735: Undo revoke. The entry comes back as it was and approved, both rows of a pair (D533). The
 * limits a new entry meets are re-checked on the entry's own day, in one transaction.
 */
export async function restoreSubmission(id: string, activityId: string, by: RevokedBy): Promise<RestoreCode> {
  const { data, error } = await serviceClient().rpc("restore_submission", {
    p_id: id, p_activity_id: activityId,
    p_user_id: "userId" in by ? by.userId : null,
    p_verifier_id: "verifierId" in by ? by.verifierId : null,
  });
  if (error) throw error;
  return data as RestoreCode;
}

/**
 * The only write path for a submission, as `bookSession` is for a seat. Everything it can
 * refuse comes back as a code, never an exception (D167).
 *
 * `submit_answers` refuses a booking-kind activity with `missing`, so a posted booking id
 * cannot reach this table now that both kinds share an id space (D178).
 */
export async function submitAnswers(
  activityId: string, attendeeId: string, answers: Record<string, string>, today: string,
  /** D392: the group member sending this for `attendeeId`; null when they send it themselves. */
  submittedBy: string | null = null,
  /** D396: the fingerprints of this request's uploads; a match in the member's live entries is `duplicate`. */
  fileHashes: Record<string, string> = {},
  /** D760: the door this was filled at; set, the activity may be closed (a door survey stays off the portal). */
  checkpointId: string | null = null,
): Promise<SubmitCode> {
  const { data, error } = await serviceClient().rpc("submit_answers", {
    p_activity_id: activityId, p_attendee_id: attendeeId, p_answers: answers, p_today: today, p_submitted_by: submittedBy,
    p_file_hashes: fileHashes, p_checkpoint_id: checkpointId,
  });
  if (error) throw error;
  return data as SubmitCode;
}

/**
 * D527: the tagged submit - both people's entries or neither, decided in one transaction by
 * `submit_answers_pair`. `who` says whose refusal it is, so the message can name the partner.
 */
export async function submitAnswersPair(
  activityId: string, attendeeId: string, partnerId: string, answers: Record<string, string>, today: string,
  submittedBy: string | null, fileHashes: Record<string, string>,
): Promise<{ code: PairCode; who: PairWho }> {
  const { data, error } = await serviceClient().rpc("submit_answers_pair", {
    p_activity_id: activityId, p_attendee_id: attendeeId, p_partner_id: partnerId, p_answers: answers, p_today: today,
    p_submitted_by: submittedBy, p_file_hashes: fileHashes,
  });
  if (error) throw error;
  const row = (data as { code: PairCode; who: PairWho }[] | null)?.[0];
  return row ?? { code: "missing", who: "self" };
}

/**
 * Syncs `per_day` onto this activity's submissions, which carry it denormalised so the
 * partial unique index can see it without a join (D165).
 *
 * Called BEFORE the activity row is updated, because it is the write that can fail: the
 * index rejects it when somebody already submitted twice in one day. A throw therefore
 * leaves both tables exactly as they were. Two statements, no transaction - not atomic, and
 * deliberately ordered so that does not matter.
 */
export async function syncSubmissionPerDay(activityId: string, perDay: boolean): Promise<void> {
  const { error } = await serviceClient().from("activity_submissions")
    .update({ per_day: perDay }).eq("activity_id", activityId);
  if (error) throw error;
}
