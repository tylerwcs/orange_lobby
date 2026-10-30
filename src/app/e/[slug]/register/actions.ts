"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { validateRegistration } from "@/lib/registration";
import { registrationErrors } from "@/lib/registration-check";
import { isRichTextEmpty } from "@/lib/rich-text";
import { allow } from "@/lib/ratelimit";
import { showsDonePage } from "@/lib/registration-done";
import { eventAddress } from "@/features/domains";
import { attendeeLink } from "@/lib/links";
import { bookableAfterRegister, fillFreePlaces, notifyRegistered, registerLanding, registerOrQueue, registrationOpen } from "@/features/registration-queue";
import { countBookingsBySession, getActivity, listSessions } from "@/features/activities";
import { findByToken } from "@/lib/db/attendees";
import { nowInKL } from "@/lib/time";
import type { Event } from "@/lib/types";

export type RegisterState = { errors?: Record<string, string>; values?: Record<string, string> };

/**
 * `waitlist` is true when the form was the waiting-list one (`?waitlist=1` on a full event, D678):
 * a person it puts on the waiting list asked to be there, so their page does not say the event
 * filled up while they were registering (D695).
 */
export async function registerAction(slug: string, waitlist: boolean, _prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const event = await getEventBySlug(slug);
  if (!event || event.status === "archived") return { errors: { form: "Registration is not available." } };
  if (!registrationOpen(event, new Date())) return { errors: { form: "Registration is closed." } };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`reg:${event.id}:${ip}`, 10, 60_000)) return { errors: { form: "Too many attempts. Try again in a minute." } };

  const values: Record<string, string> = {};
  formData.forEach((v, k) => { if (typeof v === "string") values[k] = v; });
  // Answers and both ticks checked together, so one submit reports everything to fix (D410).
  // The form runs the same check before it sends (D546); this is what a direct POST meets.
  const hasTerms = !isRichTextEmpty(event.registration_terms);
  const errors = registrationErrors(values, event.registration_form, hasTerms);
  const result = validateRegistration(values, event.registration_questions);
  if (Object.keys(errors).length || !result.ok) return { errors, values };

  // D678, D691, D692, D697: updates an active attendee, or registers, queues or holds for approval
  // a new one, under the event lock; consent and the terms tick are stamped in the same write.
  const { outcome, token } = await registerOrQueue(event, result.data, { terms: hasTerms });
  // An active person who still had a pending entry has just had it closed, which frees the place
  // it held; the SQL does not refill it, so this does (D682). A problem here - a fill error, a
  // failed WhatsApp - never stands between the person and their link.
  if (outcome === "updated") {
    try {
      await notifyRegistered(event, await fillFreePlaces(event.id), "moved_in");
    } catch (e) {
      console.error("registerAction: fill after update failed", e);
    }
  }
  // D634, D690, D695: the "You're in" page, or their link (with the filled-up note when they lost the race).
  // D766: or straight to the booking the organiser set to open after registering.
  const booking = outcome === "registered" || outcome === "updated" ? await bookingToOpen(event, token) : null;
  const landing = registerLanding(outcome, { showsDone: showsDonePage(event), waitlistForm: waitlist, booking });
  if (landing.to === "done") redirect(`/e/${slug}/register/done?t=${token}`);
  const link = attendeeLink(await eventAddress(event), token);
  if (landing.to === "activity") redirect(`${link}/activities/${landing.id}`);
  redirect(landing.filled ? `${link}?filled=1` : link);
}

/**
 * D766: the booking to open right after registering, when this person can book it now - or null,
 * and they land as before. A failed read is a null too: it never stands between someone and their link.
 */
async function bookingToOpen(event: Event, token: string): Promise<string | null> {
  if (!event.after_register_activity_id) return null;
  try {
    const [activity, attendee, sessions, counts] = await Promise.all([
      getActivity(event.after_register_activity_id, event.id),
      findByToken(event.id, token),
      listSessions(event.id),
      countBookingsBySession(event.id),
    ]);
    if (!activity || !attendee) return null;
    return bookableAfterRegister({ activity, sessions, counts, category: attendee.category, now: nowInKL() }) ? activity.id : null;
  } catch (e) {
    console.error("registerAction: could not check the booking to open", e);
    return null;
  }
}
