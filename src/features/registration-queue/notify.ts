import "server-only";
import { getAttendee } from "@/lib/db/attendees";
import { eventFields } from "@/lib/attendee-fields";
import { splitAudience } from "@/lib/whatsapp-audience";
import { runSend } from "@/lib/whatsapp-run";
import { serviceClient } from "@/lib/supabase/service";
import { firstName, queueDedupeKey, type NotifyResult } from "./lib/rules";
import type { Moved } from "./db";
import type { Event } from "@/lib/types";

/**
 * D684, D699: WhatsApps each person who has just become registered their link. Template
 * `ecphub_waitlist_moved_in` when they came off the waiting list, `ecphub_registration_approved`
 * when an organiser approved them. Body {{1}} first name, {{2}} event name, button = their token.
 *
 * Rows that only became `pending` are skipped (D700, D701): nothing is said until they are in.
 * Runs after the move is saved and never throws: a missing phone, an unapproved template or the
 * API being down must not undo or fail the move (D684). Each send is keyed per admission (`queueDedupeKey`: reason, entry and the entry's joined_at, which changes when someone starts over, D702),
 * so a retried action cannot message anyone twice but a second admission of the same person still goes out. `noNumber` counts people with no usable mobile
 * (nothing reaches the Send log for them), `failed` sends that were refused or broke; a send an earlier run already made counts as none.
 */
export async function notifyRegistered(
  ev: Event,
  moved: Moved[],
  reason: "moved_in" | "approved",
): Promise<NotifyResult> {
  const total: NotifyResult = { sent: 0, failed: 0, noNumber: 0 };
  const template = reason === "approved" ? "ecphub_registration_approved" : "ecphub_waitlist_moved_in";
  for (const m of moved) {
    if (m.newState !== "registered" || !m.attendeeId) continue;
    try {
      const attendee = await getAttendee(m.attendeeId);
      if (!attendee) continue;
      // D702: the entry row is reused when someone starts over, so the key carries its joined_at.
      const { data: entry, error: entryError } = await serviceClient().from("registration_entries").select("joined_at").eq("id", m.entryId).maybeSingle();
      if (entryError || !entry) { total.failed++; continue; }
      const joinedAt = (entry as { joined_at: string }).joined_at;
      const { recipients } = splitAudience([attendee], eventFields(ev.registration_questions, ev.attendee_fields));
      if (recipients.length === 0) { total.noNumber++; continue; } // no usable number on file
      const res = await runSend({
        orgId: ev.org_id,
        eventId: ev.id,
        template,
        recipients,
        params: (a) => ({ bodyParams: [firstName(a.name), ev.name], buttonParam: a.token }),
        dedupeKey: () => queueDedupeKey(reason, m.entryId, joinedAt),
      });
      total.sent += res.sent;
      total.failed += res.failed;
    } catch {
      total.failed++;
    }
  }
  return total;
}
