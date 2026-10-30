import { eligible, seatsFor } from "@/features/activities/client";
import type { Activity, ActivitySession, RegistrationEntryState } from "@/lib/types";

/** The entry states a personal link shows the queue card for (D680, D681, D697, D700). `registered` is not one: that person is an attendee. */
export const QUEUE_CARD_STATES: readonly RegistrationEntryState[] = ["waiting", "pending", "declined", "left", "removed"];

export type TokenView<A, E> =
  | { kind: "portal"; attendee: A }
  | { kind: "queue"; entry: E }
  | { kind: "cancelled"; attendee: A }
  | { kind: "missing" };

/**
 * D689: what a personal link shows. An active attendee gets the portal; else an entry in a queue
 * state gets the queue card; else a cancelled attendee gets the cancelled card; else nothing (404).
 * The entry is looked at before the cancelled row because a returning cancelled person shares one
 * token between the two (D695), and the entry is the newer story.
 */
export function resolveTokenView<A extends { cancelled_at?: string | null }, E extends { state: RegistrationEntryState }>(
  attendee: A | null,
  entry: E | null,
): TokenView<A, E> {
  if (attendee && !attendee.cancelled_at) return { kind: "portal", attendee };
  if (entry && QUEUE_CARD_STATES.includes(entry.state)) return { kind: "queue", entry };
  if (attendee) return { kind: "cancelled", attendee };
  return { kind: "missing" };
}

export type RegisterLanding = { to: "done" } | { to: "link"; filled: boolean } | { to: "activity"; id: string };

/**
 * Where the registration form sends someone. Registered or updated: the "You're in" page when the
 * organiser has it on (D634), else their link. Waiting or pending: always their link (D690); a
 * waiting person who sent the normal form, not the waiting-list one, lost the race for the last
 * place and their page says so (D695).
 *
 * D766: `booking` is the activity the organiser set to open right after registering, when this
 * person can book it now (`bookableAfterRegister`). It wins over the "You're in" page for anyone
 * now registered; someone waiting or pending can't book yet and lands as before.
 */
export function registerLanding(
  outcome: "updated" | "waiting" | "pending" | "registered",
  opts: { showsDone: boolean; waitlistForm: boolean; booking?: string | null },
): RegisterLanding {
  if (outcome === "waiting") return { to: "link", filled: !opts.waitlistForm };
  if (outcome === "pending") return { to: "link", filled: false };
  if (opts.booking) return { to: "activity", id: opts.booking };
  return opts.showsDone ? { to: "done" } : { to: "link", filled: false };
}

/**
 * D766: whether the activity set to open after registering is worth opening for this person now -
 * an open booking they can see, with a slot that hasn't started and still has room. Otherwise
 * they land as before, rather than on a page with nothing to book.
 */
export function bookableAfterRegister(x: {
  activity: Pick<Activity, "id" | "kind" | "is_open" | "categories">;
  sessions: ActivitySession[];
  /** Bookings per session id. */
  counts: Record<string, number>;
  category: string | null;
  /** `nowInKL()`. */
  now: { date: string; time: string };
}): boolean {
  const { activity, sessions, counts, category, now } = x;
  if (activity.kind !== "booking" || !activity.is_open || !eligible(activity, category)) return false;
  return sessions.some((s) => s.activity_id === activity.id
    && (s.day > now.date || (s.day === now.date && s.starts_at > now.time))
    && !seatsFor(s, counts[s.id] ?? 0).full);
}
