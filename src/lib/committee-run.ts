import "server-only";
import { listDueRequests, claimForReminder } from "@/features/activities";
import { getEvent } from "@/lib/db/events";
import { sendTemplate } from "@/lib/whatsapp";
import { dueCutoff, groupByEvent, pendingPhrase } from "@/lib/committee-reminders";

export type RoundResult = { events: number; requests: number; sent: number; failed: number };

/**
 * One reminder round: every event whose change requests have waited an hour gets one WhatsApp
 * per committee number saying how many. Requests are claimed before anything is sent (see
 * claimForReminder), so each is announced once however the rounds overlap or fail.
 */
export async function runCommitteeReminders(now: Date): Promise<RoundResult> {
  const result: RoundResult = { events: 0, requests: 0, sent: 0, failed: 0 };
  for (const [eventId, ids] of groupByEvent(await listDueRequests(dueCutoff(now)))) {
    const ev = await getEvent(eventId);
    if (!ev || ev.committee_alert_numbers.length === 0) continue;
    const claimed = await claimForReminder(ids);
    if (claimed.length === 0) continue;
    result.events++;
    result.requests += claimed.length;
    for (const to of ev.committee_alert_numbers) {
      const res = await sendTemplate({
        to, template: "ecphub_committee_pending",
        bodyParams: [pendingPhrase(claimed.length), ev.name], buttonParam: ev.id,
      });
      if (res.ok) result.sent++;
      else { result.failed++; console.error(`committee reminder to ${to} for ${ev.id} failed: ${res.title}`); }
    }
  }
  return result;
}
