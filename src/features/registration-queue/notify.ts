import "server-only";
import { getAttendee } from "@/lib/db/attendees";
import { eventFields } from "@/lib/attendee-fields";
import { splitAudience } from "@/lib/whatsapp-audience";
import { runSend } from "@/lib/whatsapp-run";
import { firstName } from "./lib/rules";
import type { Moved } from "./db";
import type { Event } from "@/lib/types";

/**
 * D684, D699: WhatsApps each person who has just become registered their link. Template
 * `ecphub_waitlist_moved_in` when they came off the waiting list, `ecphub_registration_approved`
 * when an organiser approved them. Body {{1}} first name, {{2}} event name, button = their token.
 *
 * Rows that only became `pending` are skipped (D700, D701): nothing is said until they are in.
 * Runs after the move is saved and never throws: a missing phone, an unapproved template or the
 * API being down must not undo or fail the move (D684). Each send is keyed `<reason>:<entryId>`,
 * so a retried action cannot message anyone twice. `failed` counts people who could not be reached
 * or whose send was refused; a send an earlier run already made counts as neither.
 */
export async function notifyRegistered(
  ev: Event,
  moved: Moved[],
  reason: "moved_in" | "approved",
): Promise<{ sent: number; failed: number }> {
  const total = { sent: 0, failed: 0 };
  const template = reason === "approved" ? "ecphub_registration_approved" : "ecphub_waitlist_moved_in";
  for (const m of moved) {
    if (m.newState !== "registered" || !m.attendeeId) continue;
    try {
      const attendee = await getAttendee(m.attendeeId);
      if (!attendee) continue;
      const { recipients } = splitAudience([attendee], eventFields(ev.registration_questions, ev.attendee_fields));
      if (recipients.length === 0) { total.failed++; continue; } // no usable number on file
      const res = await runSend({
        orgId: ev.org_id,
        eventId: ev.id,
        template,
        recipients,
        params: (a) => ({ bodyParams: [firstName(a.name), ev.name], buttonParam: a.token }),
        dedupeKey: () => `${reason}:${m.entryId}`,
      });
      total.sent += res.sent;
      total.failed += res.failed;
    } catch {
      total.failed++;
    }
  }
  return total;
}
