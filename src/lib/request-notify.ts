import "server-only";
import { getAttendee } from "@/lib/db/attendees";
import { getActivity, listSessions } from "@/lib/db/activities";
import { eventFields } from "@/lib/attendee-fields";
import { splitAudience } from "@/lib/whatsapp-audience";
import { runSend } from "@/lib/whatsapp-run";
import { noticeSessionLabel, requestNotice } from "@/lib/request-notice";
import type { ActivityChangeRequest, Event } from "@/lib/types";

export type NotifyOutcome = { sent: true } | { sent: false; reason: string };

/**
 * WhatsApps the attendee the desk's decision on their change request.
 *
 * Runs only after `decide_request` has said `ok`, and never throws: the decision is already
 * made and saved, and a WhatsApp problem — no phone on file, a template Meta has not approved
 * yet, the API down — must not turn a successful approve into an error page. It reports what
 * happened instead, for the desk's flash to say.
 *
 * Goes through `runSend`, so the message lands in the event's WhatsApp log like any other,
 * keyed `request:<id>` — one request can only ever message once, however often the form is
 * resubmitted.
 */
export async function notifyRequestDecision(
  ev: Event,
  request: ActivityChangeRequest,
  decision: "approved" | "declined",
): Promise<NotifyOutcome> {
  try {
    const [attendee, activity, sessions] = await Promise.all([
      getAttendee(request.attendee_id), getActivity(request.activity_id, ev.id), listSessions(ev.id),
    ]);
    if (!attendee || !activity) return { sent: false, reason: "the attendee or activity is no longer there" };

    const byId = new Map(sessions.map((s) => [s.id, s]));
    const from = byId.get(request.from_session_id);
    const to = request.to_session_id ? byId.get(request.to_session_id) : undefined;
    const notice = requestNotice({
      decision,
      kind: request.kind,
      attendeeName: attendee.name,
      activityName: activity.name,
      eventName: ev.name,
      fromSession: from ? noticeSessionLabel(from) : "",
      toSession: to ? noticeSessionLabel(to) : null,
    });

    const { recipients, unusable } = splitAudience([attendee], eventFields(ev.registration_questions, ev.attendee_fields));
    if (recipients.length === 0) {
      const why = unusable[0]?.reason ?? "No phone number on file";
      return { sent: false, reason: why.charAt(0).toLowerCase() + why.slice(1) };
    }

    const result = await runSend({
      orgId: ev.org_id,
      eventId: ev.id,
      template: notice.template,
      recipients,
      params: () => ({ bodyParams: notice.bodyParams, buttonParam: attendee.token }),
      dedupeKey: () => `request:${request.id}`,
    });
    if (result.sent > 0) return { sent: true };
    if (result.skipped > 0) return { sent: false, reason: "it was already sent for this request" };
    return { sent: false, reason: result.lastError ?? "WhatsApp refused it" };
  } catch {
    return { sent: false, reason: "something went wrong while sending" };
  }
}

/** The desk's flash line: the decision first, then what WhatsApp did with it. */
export function decisionFlash(decided: string, outcome: NotifyOutcome): string {
  return outcome.sent ? `${decided} WhatsApp sent.` : `${decided} Not sent on WhatsApp: ${outcome.reason}.`;
}
