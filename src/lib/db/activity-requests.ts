import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { switchSession, cancelBooking } from "@/lib/db/activities";
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
 * Stamps the decision. Scoped by `status = 'pending'` so two desks clicking Approve at once
 * cannot both record a decision — the second updates no rows and the caller reports that.
 *
 * This does NOT move the booking. The caller has already called switch_session or
 * cancel_booking and only reaches here on 'ok' (D154).
 */
export async function markDecided(
  id: string,
  eventId: string,
  status: "approved" | "declined",
  userId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_change_requests")
    .update({ status, decided_at: new Date().toISOString(), decided_by: userId })
    .eq("id", id).eq("event_id", eventId).eq("status", "pending").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Carries out an approved request against the database, without recording anything.
 *
 * Goes through the locked functions rather than writing bookings itself (D154): they are the
 * only callers that hold the session and activity row locks, and an approval that bypassed
 * them would be the one path in the system that can overbook. `ignoreOpen` is true because
 * the desk works the queue after booking has closed (D156) — it does not bypass capacity.
 */
export async function applyRequest(request: ActivityChangeRequest): Promise<DecisionResult> {
  return request.kind === "switch" && request.to_session_id
    ? switchSession(request.from_session_id, request.to_session_id, request.attendee_id, true)
    : cancelBooking(request.from_session_id, request.attendee_id);
}
