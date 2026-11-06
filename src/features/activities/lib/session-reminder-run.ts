import "server-only";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { listEventsByIds } from "@/lib/db/events";
import { eventFields } from "@/lib/attendee-fields";
import { splitAudience } from "@/lib/whatsapp-audience";
import { runSend } from "@/lib/whatsapp-run";
import { bookingValues } from "@/lib/whatsapp-templates";
import { eventFeatures, has } from "@/features/catalogue";
import { listBookingsForSessions, listReminderActivities, listSessionsForActivities } from "../db/activities";
import { REMINDER_TEMPLATE, reminderDays, reminderDue, reminderKey, reminderReady } from "./session-reminders";

export type ReminderRound = { sessions: number; sent: number; failed: number; skipped: number; notReady: number };

/**
 * D836: one timer round. Every session of a booking activity with a reminder set, starting
 * within its minutes, has its bookers sent `ecphub_slot_reminder_map`: their name, the
 * activity, the session's time and place, and buttons to their booking and the map.
 *
 * Only live events with WhatsApp turned on. Each person is claimed once per session
 * (`reminderKey`) before anything is sent, so overlapping or repeated rounds message nobody
 * twice, and a failed send is left failed rather than retried every minute. A session with no
 * location or map link is skipped (`notReady`): the activity's admin page warns about it.
 */
export async function runSessionReminders(now: Date): Promise<ReminderRound> {
  const round: ReminderRound = { sessions: 0, sent: 0, failed: 0, skipped: 0, notReady: 0 };
  const activities = await listReminderActivities();
  if (activities.length === 0) return round;

  const due = (await listSessionsForActivities(activities.map((a) => a.id), reminderDays(now)))
    .filter((s) => reminderDue(s, activities.find((a) => a.id === s.activity_id)!.whatsapp_reminder_minutes!, now));
  if (due.length === 0) return round;

  const events = await listEventsByIds([...new Set(due.map((s) => s.event_id))]);
  const bookings = await listBookingsForSessions(due.map((s) => s.id));

  for (const ev of events) {
    if (ev.status !== "live" || !has(await eventFeatures(ev.id), "whatsapp")) continue;
    const fields = eventFields(ev.registration_questions, ev.attendee_fields);
    for (const session of due.filter((s) => s.event_id === ev.id)) {
      if (!reminderReady(session)) { round.notReady++; continue; }
      const activity = activities.find((a) => a.id === session.activity_id)!;
      const ids = bookings.filter((b) => b.session_id === session.id).map((b) => b.attendee_id);
      if (ids.length === 0) continue;
      const attendees = (await listAttendeesByIds(ev.id, ids)).filter((a) => !a.cancelled_at);
      const { recipients } = splitAudience(attendees, fields);
      if (recipients.length === 0) continue;
      round.sessions++;
      const booking = bookingValues(activity.name, session)!;
      const result = await runSend({
        orgId: ev.org_id,
        eventId: ev.id,
        template: REMINDER_TEMPLATE,
        recipients,
        params: (a) => ({ bodyParams: [a.name, booking.activity, booking.time, booking.location], buttonParams: [a.token, session.id] }),
        dedupeKey: (a) => reminderKey(session.id, a.id),
        retryFailed: false,
      });
      round.sent += result.sent;
      round.failed += result.failed;
      round.skipped += result.skipped;
      if (result.lastError) console.error(`session reminder for ${session.id} failed: ${result.lastError}`);
    }
  }
  return round;
}
