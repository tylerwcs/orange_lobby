import { displayName } from "@/lib/text";
import type { Event } from "@/lib/types";

/** The success page's wording when the organiser has not written their own (D537). `{name}` is the first name. */
export const DEFAULT_DONE_TITLE = "You're in, {name}";
export const DEFAULT_DONE_MESSAGE_DOOR =
  "Show this at the door. It is also your event page — the agenda, your table, and anything the organiser posts.";
export const DEFAULT_DONE_MESSAGE_NO_DOOR =
  "Your event page has the agenda, your details and anything the organiser posts. Keep it handy: open it and add it to your home screen.";

/** Swaps every `{name}` (any case, spaces allowed inside the braces) for the attendee's first name. */
export function fillName(text: string, attendeeName: string): string {
  const first = displayName(attendeeName).split(" ")[0] ?? "";
  return text.replace(/\{\s*name\s*\}/gi, first);
}

/**
 * D634: whether registering shows the "You're in" page. Off unless the organiser turns it on;
 * without it the attendee lands straight on their own event page.
 */
export function showsDonePage(e: { registration_done_page?: boolean }): boolean {
  return e.registration_done_page === true;
}

/**
 * The heading and message on /register/done. A blank field falls back to the default, and the
 * default message still follows check-in: with no door there is no QR to "show at the door".
 */
export function doneCopy(
  e: Pick<Event, "registration_done_title" | "registration_done_message" | "check_in_enabled">,
  attendeeName: string,
) {
  const title = e.registration_done_title?.trim() || DEFAULT_DONE_TITLE;
  const message = e.registration_done_message?.trim()
    || (e.check_in_enabled ? DEFAULT_DONE_MESSAGE_DOOR : DEFAULT_DONE_MESSAGE_NO_DOOR);
  return { title: fillName(title, attendeeName), message: fillName(message, attendeeName) };
}
