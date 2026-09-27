import type { ActivityRequestKind } from "@/lib/types";

/**
 * The WhatsApp an attendee gets when the desk decides their booking change request.
 *
 * Three Utility templates, each worded like a booking confirmation (see the WhatsApp memory:
 * anything that reads like marketing or a login gets reclassified, and a Marketing template is
 * frequency-capped into silent failures):
 *
 * - `ecphub_booking_changed`   — a switch approved: {{1}} name, {{2}} activity, {{3}} event, {{4}} the new session
 * - `ecphub_booking_cancelled` — a cancel approved: {{1}}–{{3}} as above, no session to name
 * - `ecphub_request_declined`  — either kind declined: {{4}} is the session they still hold
 *
 * All three carry the portal button, `/a/{{1}}`, filled with the attendee's token.
 */
export type RequestNoticeInput = {
  decision: "approved" | "declined";
  kind: ActivityRequestKind;
  attendeeName: string;
  activityName: string;
  eventName: string;
  /** The session they held when they asked. */
  fromSession: string;
  /** Where they asked to go; null for a cancel. */
  toSession: string | null;
};

export type RequestNotice = { template: string; bodyParams: string[] };

/**
 * Meta rejects a parameter containing a newline or a tab, or more than four spaces in a row,
 * and rejects an empty one outright — a masterlist cell can carry any of those.
 */
function param(value: string, fallback: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat || fallback;
}

export function requestNotice(i: RequestNoticeInput): RequestNotice {
  const head = [param(i.attendeeName, "there"), param(i.activityName, "your activity"), param(i.eventName, "the event")];
  if (i.decision === "declined") {
    return { template: "ecphub_request_declined", bodyParams: [...head, param(i.fromSession, "your current session")] };
  }
  if (i.kind === "cancel") return { template: "ecphub_booking_cancelled", bodyParams: head };
  return { template: "ecphub_booking_changed", bodyParams: [...head, param(i.toSession ?? "", "your new session")] };
}
