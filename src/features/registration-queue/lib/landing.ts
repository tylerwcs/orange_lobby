import type { RegistrationEntryState } from "@/lib/types";

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

export type RegisterLanding = { to: "done" } | { to: "link"; filled: boolean };

/**
 * Where the registration form sends someone. Registered or updated: the "You're in" page when the
 * organiser has it on (D634), else their link. Waiting or pending: always their link (D690); a
 * waiting person who sent the normal form, not the waiting-list one, lost the race for the last
 * place and their page says so (D695).
 */
export function registerLanding(
  outcome: "updated" | "waiting" | "pending" | "registered",
  opts: { showsDone: boolean; waitlistForm: boolean },
): RegisterLanding {
  if (outcome === "waiting") return { to: "link", filled: !opts.waitlistForm };
  if (outcome === "pending") return { to: "link", filled: false };
  return opts.showsDone ? { to: "done" } : { to: "link", filled: false };
}
