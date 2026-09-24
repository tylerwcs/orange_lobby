import "server-only";
import { claimSend, markAccepted, markFailed } from "@/lib/db/whatsapp-sends";
import { sendTemplate } from "@/lib/whatsapp";
import type { AudienceAttendee, Recipient } from "@/lib/whatsapp-audience";

/** The approved template that carries an attendee their personal portal link. */
export const PORTAL_LINK_TEMPLATE = "ecphub_portallink";

export type RunResult = { sent: number; failed: number; skipped: number };

/**
 * Sends one template to a list of recipients, recording every outcome.
 *
 * Claim first, send second (see `claimSend`): the row that reserves an attendee goes in before
 * the message goes out, so a run interrupted halfway can be re-run without messaging anybody
 * twice. `skipped` counts attendees a previous run already claimed — on a retry that number is
 * the whole point, not a problem.
 *
 * Five at a time. Cloud API will take far more, but 150 messages do not need the throughput,
 * and a narrow pool keeps the log readable and the failure blast radius small when something
 * is wrong with the template rather than with one number.
 */
export async function runSend<T extends AudienceAttendee>(input: {
  orgId: string;
  eventId: string;
  template: string;
  language?: string;
  recipients: Recipient<T>[];
  /** Per-attendee variables. Returns the body values in `{{n}}` order, plus the button's token. */
  params: (attendee: T) => { bodyParams: string[]; buttonParam?: string };
  /** A stable key per attendee makes the run idempotent; null lets the message repeat. */
  dedupeKey: (attendee: T) => string | null;
}): Promise<RunResult> {
  const result: RunResult = { sent: 0, failed: 0, skipped: 0 };
  const queue = [...input.recipients];
  let next = 0;

  const worker = async () => {
    while (next < queue.length) {
      const { attendee, to } = queue[next++];
      const claim = await claimSend({
        orgId: input.orgId,
        eventId: input.eventId,
        attendeeId: attendee.id,
        template: input.template,
        toE164: to,
        dedupeKey: input.dedupeKey(attendee),
      });
      if (!claim) {
        result.skipped++;
        continue;
      }
      const { bodyParams, buttonParam } = input.params(attendee);
      const res = await sendTemplate({ to, template: input.template, language: input.language, bodyParams, buttonParam });
      if (res.ok) {
        await markAccepted(claim.id, res.wamid);
        result.sent++;
      } else {
        await markFailed(claim.id, res.code, res.title);
        result.failed++;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
  return result;
}
