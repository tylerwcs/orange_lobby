import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { DecisionResult } from "@/lib/db/activities";
import type { ActivityChangeRequest } from "@/lib/types";

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
