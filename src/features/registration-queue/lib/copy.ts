import type { Event } from "@/lib/types";

/**
 * D708: the wording on the "Registration is full" page, the waiting page and the pending page when
 * the organiser has not written their own (Settings → Registration form → Waiting list). The full
 * page no longer says every place is taken, and the waiting page gives no queue number: the
 * organiser asked for a plain "we've got you, we'll tell you".
 */
export const QUEUE_COPY_DEFAULTS = {
  fullTitle: "Registration is full",
  fullMessage: "Join the waiting list to be next in line if a place opens up. If you have already registered, open the link you were sent.",
  waitingTitle: "You're on the waiting list",
  waitingMessage: "We have received your registration. We will inform you once a slot opens up.",
  pendingTitle: "Your registration is waiting for the organiser's approval",
  pendingMessage: "Your place is held while they decide. Keep this link: it becomes your event page once they confirm.",
} as const;

export type QueueCopy = { [K in keyof typeof QUEUE_COPY_DEFAULTS]: string };

type CopyFields = Partial<Pick<Event,
  | "registration_full_title" | "registration_full_message"
  | "registration_waiting_title" | "registration_waiting_message"
  | "registration_pending_title" | "registration_pending_message">>;

/** D708: each field the organiser wrote, trimmed; a blank one falls back to its default. Line breaks inside are kept. */
export function queueCopy(e: CopyFields): QueueCopy {
  const pick = (v: string | null | undefined, d: string) => v?.trim() || d;
  const d = QUEUE_COPY_DEFAULTS;
  return {
    fullTitle: pick(e.registration_full_title, d.fullTitle),
    fullMessage: pick(e.registration_full_message, d.fullMessage),
    waitingTitle: pick(e.registration_waiting_title, d.waitingTitle),
    waitingMessage: pick(e.registration_waiting_message, d.waitingMessage),
    pendingTitle: pick(e.registration_pending_title, d.pendingTitle),
    pendingMessage: pick(e.registration_pending_message, d.pendingMessage),
  };
}
