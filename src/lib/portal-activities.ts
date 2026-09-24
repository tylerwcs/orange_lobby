import { eligible, type ActivityState } from "@/lib/activities";
import type { Activity } from "@/lib/types";
import type { Passport } from "@/lib/booths";

/**
 * Where an activity sits on the attendee's Activities tab.
 *
 * "choose" is the one that is owed — required, eligible, nothing held — and leads the page for
 * the same reason the old home card led with it (D129). "booked" is anything they hold a seat
 * in or have a request open on, because that is where the switch and cancel controls live.
 * "open" is everything else they can see, closed ones included: a closed activity still has a
 * desk to ask. "done" is a completed passport. Null is an activity their category cannot see at all.
 */
export type ActivitySection = "choose" | "booked" | "open" | "done";

export function bookingSection(state: ActivityState, pending: boolean): ActivitySection | null {
  if (!state.eligible) return null;
  if (state.mustPick) return "choose";
  if (state.held > 0 || pending) return "booked";
  return "open";
}

/**
 * Where a passport sits on the Activities tab (D192): Open to you while there are stamps to
 * collect, Done once the card is full. Never To choose — that section means "you owe a pick",
 * and nothing is owed on a passport until a booth has stamped you (D183).
 */
export function passportSection(passport: Pick<Passport, "complete">): "open" | "done" {
  return passport.complete ? "done" : "open";
}

/**
 * What the launcher and the desktop header need to know about activities: whether to offer
 * them at all, and whether to put a dot on the button.
 *
 * Mirrors `Info`, which only appears when there is an info page — a tab that leads to "nothing
 * here" is worse than no tab. The dot replaces the home card's "Pick one" nag, so it means
 * exactly what `mustPick` means, limited to booking activities: those are the only ones the
 * tab puts under To choose. A passport, even if marked required, never owes anything (D183).
 *
 * Takes the ids of activities with a held seat rather than full states, so the layout can
 * answer this without counting every session's bookings.
 */
export type ActivityNav = { show: boolean; owed: boolean };

export function activityNav(
  activities: Pick<Activity, "id" | "kind" | "required" | "categories">[],
  category: string | null,
  heldActivityIds: ReadonlySet<string>,
): ActivityNav {
  const visible = activities.filter((a) => eligible(a, category));
  return {
    show: visible.length > 0,
    owed: visible.some((a) => a.kind === "booking" && a.required && !heldActivityIds.has(a.id)),
  };
}
