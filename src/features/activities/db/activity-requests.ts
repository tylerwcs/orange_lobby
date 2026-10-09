import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { listSessionsOn, type DecisionResult } from "./activities";
import { requestsAtDoor } from "../lib/activity-requests";
import type { ActivityChangeRequest, Checkpoint } from "@/lib/types";

export type NewRequest = {
  eventId: string;
  activityId: string;
  attendeeId: string;
  fromSessionId: string;
  /** Null makes it a cancel. The database rejects the mismatched pairings. */
  toSessionId: string | null;
};

export async function listRequests(eventId: string): Promise<ActivityChangeRequest[]> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityChangeRequest[];
}

/** This attendee's requests. The portal's hot path — one query, one attendee. */
export async function requestsForAttendee(attendeeId: string): Promise<ActivityChangeRequest[]> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("attendee_id", attendeeId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityChangeRequest[];
}

export async function getRequest(id: string, eventId: string): Promise<ActivityChangeRequest | null> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as ActivityChangeRequest | null) ?? null;
}

/**
 * Raises a request, or reports that one is already open.
 *
 * "One open request per attendee per activity" is a partial unique index, not a check here
 * (D146): two tabs is exactly when an application-side check fails. 23505 is the unique
 * violation, and it is an answer rather than an error — the attendee has a request open and
 * the page should say so.
 */
export async function createRequest(input: NewRequest): Promise<"ok" | "duplicate"> {
  const { error } = await serviceClient().from("activity_change_requests").insert({
    event_id: input.eventId,
    activity_id: input.activityId,
    attendee_id: input.attendeeId,
    kind: input.toSessionId ? "switch" : "cancel",
    from_session_id: input.fromSessionId,
    to_session_id: input.toSessionId,
  });
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return "ok";
}

/**
 * The attendee's own escape. Scoped by attendee as well as id, so a posted id belonging to
 * somebody else withdraws nothing, and by status so a decided request cannot be un-decided.
 */
export async function withdrawRequest(id: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_change_requests")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", id).eq("attendee_id", attendeeId).eq("status", "pending").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * D343: a check-in at a booking door closes the pending requests it makes moot (`to` =
 * "closed"), and the scanner's undo reopens them (`to` = "pending"). Which rows is
 * `requestsAtDoor`'s rule. An ordinary door touches nothing.
 *
 * Reads the activity's requests in the one status being left rather than filtering by attendee
 * in the query: an activity has a handful open at a time, and a bulk check-in can post hundreds
 * of attendee ids. The update is guarded on that status too, so it never overwrites a decision
 * that landed in between. Reopening can meet the one-open-request index (D146) if the attendee
 * raised a new request after the check-in; the closed row then simply stays closed.
 */
export async function settleRequestsAtDoor(
  door: Pick<Checkpoint, "activity_id" | "day">,
  attendeeIds: string[],
  to: "closed" | "pending",
  userId: string | null,
): Promise<number> {
  if (!door.activity_id || attendeeIds.length === 0) return 0;
  const from = to === "closed" ? "pending" : "closed";
  const db = serviceClient();
  const [sessions, { data: rows, error }] = await Promise.all([
    listSessionsOn(door.activity_id, door.day),
    db.from("activity_change_requests").select("id, activity_id, attendee_id, from_session_id, status")
      .eq("activity_id", door.activity_id).eq("status", from),
  ]);
  if (error) throw error;
  const ids = requestsAtDoor(
    (rows ?? []) as Pick<ActivityChangeRequest, "id" | "activity_id" | "attendee_id" | "from_session_id" | "status">[],
    door, new Map(sessions.map((s) => [s.id, s.day])), new Set(attendeeIds), from,
  );
  if (ids.length === 0) return 0;
  const patch = to === "closed"
    ? { status: "closed", decided_at: new Date().toISOString(), decided_by: userId }
    : { status: "pending", decided_at: null, decided_by: null };
  const { data, error: e2 } = await db.from("activity_change_requests").update(patch)
    .in("id", ids).eq("status", from).select("id");
  if (e2?.code === "23505") return 0;
  if (e2) throw e2;
  return data?.length ?? 0;
}

/**
 * Every answer `decide_request` can give. `gone` covers a request that no longer exists, is
 * no longer `pending`, or lost a race to another decision on the same row — the three are
 * indistinguishable from here and the caller has no need to tell them apart.
 */
export type DecideResult = DecisionResult | "gone";

/**
 * Carries out a decision — approve or decline — as ONE atomic step (0021_decide_request.sql).
 *
 * This used to be two separate calls from the app: apply the request (switch_session /
 * cancel_booking), then stamp it via a `status = 'pending'`-scoped update. Nothing serialised
 * those two statements against a concurrent decision on the same row, so an approve whose RPC
 * was still in flight could lose its own stamp to a decline racing in behind it — the booking
 * had genuinely moved, but the persisted record ended up reading "declined" (Task 7 review's
 * Important finding). `decide_request` selects the request `for update` before touching
 * anything, so a second call for the same id — another approve, another decline, a retry —
 * blocks on that lock instead of racing past it; whichever call wins decides the whole thing,
 * inside one transaction, in the database, exactly where every other seat-affecting rule in
 * this feature already lives (D154).
 *
 * For an approve, the nested `switch_session`/`cancel_booking` call runs `ignoreOpen = true`
 * for a switch, because the desk works the queue after booking has closed (D156) — it never
 * bypasses capacity or eligibility. If that call refuses (anything but `'ok'`), the request is
 * left `pending` and the refusal code is returned unstamped, same as before this migration.
 */
export async function decideRequest(
  requestId: string,
  status: "approved" | "declined",
  userId: string,
): Promise<DecideResult> {
  const { data, error } = await serviceClient().rpc("decide_request", {
    p_request_id: requestId, p_status: status, p_user: userId,
  });
  if (error) throw error;
  return data as DecideResult;
}

/** Pending requests old enough to remind about and not yet reminded — the round's input. */
export async function listDueRequests(cutoffIso: string): Promise<ActivityChangeRequest[]> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("status", "pending").is("reminded_at", null).lte("created_at", cutoffIso).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityChangeRequest[];
}

/**
 * Stamps `reminded_at` on those of `ids` still un-stamped and returns the ones this call won.
 * Claim before sending: two overlapping rounds then count each request once, and a template
 * still in review cannot cause a send attempt every five minutes.
 */
export async function claimForReminder(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await serviceClient().from("activity_change_requests")
    .update({ reminded_at: new Date().toISOString() })
    .in("id", ids).is("reminded_at", null).eq("status", "pending").select("id");
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}
