import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { RegistrationQuestion } from "@/lib/types";
import type { Activity, ActivityBooking, ActivityKind, ActivitySession, ActivitySubmission, Event } from "@/lib/types";

export type NewActivity = {
  name: string;
  description: string | null;
  kind: ActivityKind;
  required: boolean;
  is_open: boolean;
  /** Null is no cap at all (D178). */
  max_per_attendee: number | null;
  categories: string[] | null;
  /** Empty on a booking activity. */
  questions: RegistrationQuestion[];
  per_day: boolean;
  /** Submission kind only; left out, the column's null stands. */
  image_url?: string | null;
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
 * page (`src/app/e/[slug]/a/[token]/activities/page.tsx`) calls `listSessions`,
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

/** Appends to the end: a new activity is the next one, not the first. */
export async function createActivity(event: Pick<Event, "id" | "org_id">, input: NewActivity): Promise<void> {
  const db = serviceClient();
  const { data: last } = await db.from("activities").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("activities")
    .insert({ org_id: event.org_id, event_id: event.id, ...input, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) throw error;
}

export async function updateActivity(id: string, eventId: string, patch: Partial<NewActivity>): Promise<void> {
  const { error } = await serviceClient().from("activities").update(patch)
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Cascades its sessions and bookings, or its submissions, depending on kind (D135, D178). */
export async function deleteActivity(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("activities").delete()
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
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

export async function createSession(eventId: string, activityId: string, input: NewSession): Promise<void> {
  const db = serviceClient();
  const { data: last } = await db.from("activity_sessions").select("sort_order")
    .eq("activity_id", activityId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("activity_sessions")
    .insert({ event_id: eventId, activity_id: activityId, ...input, sort_order: (last?.sort_order ?? -1) + 1 });
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

/** Scoped by event id as well as row id, so a posted id from another event reorders nothing. */
export async function setSessionOrder(eventId: string, orderedIds: string[]): Promise<void> {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("activity_sessions").update({ sort_order: index })
      .eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}

export async function listBookings(eventId: string): Promise<ActivityBooking[]> {
  const { data, error } = await serviceClient().from("activity_bookings").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as ActivityBooking[];
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
export type SubmitCode = "ok" | "missing" | "closed" | "ineligible" | "limit" | "today";

export async function listSubmissions(eventId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("event_id", eventId).order("submitted_on", { ascending: false }).order("created_at", { ascending: false });
  if (error?.code === "PGRST205" || error?.code === "42P01") return [];
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

export async function submissionsForActivity(activityId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("activity_id", activityId).order("submitted_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

export async function submissionsForAttendee(attendeeId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("attendee_id", attendeeId).order("submitted_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
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
): Promise<SubmitCode> {
  const { data, error } = await serviceClient().rpc("submit_answers", {
    p_activity_id: activityId, p_attendee_id: attendeeId, p_answers: answers, p_today: today,
  });
  if (error) throw error;
  return data as SubmitCode;
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
