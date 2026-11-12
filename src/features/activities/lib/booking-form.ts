import "server-only";
import { getActivity, entriesForAttendee } from "../db/activities";
import { eligible } from "./activities";
import { hasHealthConsent } from "@/lib/db/health-consents";
import { sanitizeHtml } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";
import type { Activity, ActivitySubmission, Attendee, RegistrationQuestion } from "@/lib/types";

/** D898: the form a booking asks before it books, as the session picker draws it - the questions, never anyone's answers. */
export type BookingAsk = {
  id: string;
  name: string;
  descriptionHtml: string;
  questions: RegistrationQuestion[];
  /** The form holds health information and this person hasn't given consent for it yet (D412). */
  needsConsent: boolean;
};

/**
 * D898: whether this person must answer the booking's form before a seat is theirs, and the form
 * if so. Null when the booking asks none, when the form is gone or no longer a form, when it isn't
 * for their category (it would refuse them, and the seat with it), or once they have a live entry
 * in it - from an earlier booking, the door, or another tab - so they book in one step.
 *
 * `sent` is the person's live entries when the caller already has them; otherwise they are read.
 */
export async function bookingFormFor(
  booking: Pick<Activity, "event_id" | "booking_form_id">,
  attendee: Pick<Attendee, "id" | "category">,
  sent?: ActivitySubmission[],
): Promise<{ form: Activity; ask: BookingAsk } | null> {
  if (!booking.booking_form_id) return null;
  const form = await getActivity(booking.booking_form_id, booking.event_id);
  if (!form || form.kind !== "submission" || !eligible(form, attendee.category)) return null;
  const mine = sent ?? await entriesForAttendee(form.id, attendee.id);
  if (mine.some((s) => s.activity_id === form.id && s.status === "submitted")) return null;
  const needsConsent = form.health_data ? !(await hasHealthConsent(attendee.id, form.id)) : false;
  return {
    form,
    ask: { id: form.id, name: form.name, descriptionHtml: sanitizeHtml(toRichHtml(form.description)), questions: form.questions, needsConsent },
  };
}
