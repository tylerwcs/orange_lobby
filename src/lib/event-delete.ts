import type { EventStatus } from "@/lib/types";

/**
 * The two gates in front of deleting an event, kept pure so the Danger zone and the action
 * apply exactly the same rules.
 *
 * Deleting takes everything with it — attendees, check-ins, bookings, submissions, messages
 * sent, uploaded files — and cannot be undone. So a live event cannot be deleted at all: the
 * organiser moves it to Draft or Archived first, which also takes the portal down for anybody
 * still using it. And the name has to be typed, which a misplaced click cannot do.
 */
export function deleteBlockedBecause(status: EventStatus): string | null {
  return status === "live" ? "It is live. Set it to Draft or Archived first — that also closes the portal to attendees." : null;
}

/** The typed name matches, ignoring case and spaces at either end — never a partial match. */
export function confirmsDelete(typed: string, eventName: string): boolean {
  return typed.trim().toLowerCase() === eventName.trim().toLowerCase() && eventName.trim() !== "";
}
