import { eligible, type ActivityState } from "@/lib/activities";
import type { Activity } from "@/lib/types";

/**
 * Where a booking activity sits on the attendee's Activities tab.
 *
 * "choose" is the one that is owed — required, eligible, nothing held — and leads the page for
 * the same reason the old home card led with it (D129). "booked" is anything they hold a seat
 * in or have a request open on, because that is where the switch and cancel controls live.
 * Everything else they can see is "open", closed ones included: a closed activity still has a
 * desk to ask. Null is an activity their category cannot see at all.
 */
export type ActivitySection = "choose" | "booked" | "open";

export function bookingSection(state: ActivityState, pending: boolean): ActivitySection | null {
  if (!state.eligible) return null;
  if (state.mustPick) return "choose";
  if (state.held > 0 || pending) return "booked";
  return "open";
}

/**
 * What the bottom bar needs to know about activities: whether to offer the tab at all, and
 * whether to put a dot on it.
 *
 * Mirrors `Info`, which only appears when there is an info page — a tab that leads to "nothing
 * here" is worse than no tab. The dot replaces the home card's "Pick one" nag, so it means
 * exactly what `mustPick` means, limited to booking activities: those are the only ones the
 * tab puts under To choose.
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
