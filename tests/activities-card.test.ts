import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { ActivitiesCard } from "@/components/portal/ActivitiesCard";
import { Badge } from "@/components/ui/badge";
import type { ActivityState } from "@/lib/activities";
import type { Activity } from "@/lib/types";

/**
 * `ActivitiesCard` is called directly as a plain function, the way `badgeVariants` and the
 * icon registry are exercised elsewhere in this suite - there is no DOM here (`environment:
 * "node"`) and no renderer, but a function component that calls no hooks of its own needs
 * neither: `React.createElement` never invokes `Card`, `Badge` or `Link`, it only records them
 * as a `type` on a plain object. Walking that object tree is enough to prove what the tree
 * would contain without ever rendering it - the same trade `confirm-button.test.ts` makes by
 * reading source instead of a DOM, applied to the element tree instead of the text.
 */
function findElement<P extends Record<string, unknown>>(
  node: ReactNode,
  type: unknown,
  match?: (props: P) => boolean,
): ReactElement<P> | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement<P>(child, type, match);
      if (found) return found;
    }
    return null;
  }
  const el = node as ReactElement<P>;
  if (el.type === type && (!match || match(el.props))) return el;
  return findElement<P>((el.props as { children?: ReactNode })?.children, type, match);
}

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Studio Tour", description: null,
  kind: "booking", required: false, is_open: true, max_per_attendee: 1, categories: null,
  questions: [], per_day: false, sort_order: 0, ...over,
});

const state = (over: Partial<ActivityState> = {}): ActivityState => ({
  activity: activity(),
  sessions: [],
  eligible: true,
  closed: false,
  held: 0,
  canBookMore: true,
  mustPick: false,
  ...over,
});

describe("ActivitiesCard", () => {
  // The guarantee protecting every event that runs no activities: with none to show, this
  // must produce nothing at all, not an empty Card.
  it("renders nothing when there are no activities", () => {
    expect(ActivitiesCard({ states: [], basePath: "/e/s/a/t" })).toBeNull();
  });

  // `eligible` is the render gate (D131): an attendee whose category none of the event's
  // activities admit must see exactly what an attendee at an event with no activities sees -
  // nothing - even though `states` itself is non-empty.
  it("renders nothing when the attendee's category excludes every activity", () => {
    const states = [
      state({ activity: activity({ id: "act1", categories: ["VIP"] }), eligible: false }),
      state({ activity: activity({ id: "act2", categories: ["VIP"] }), eligible: false }),
    ];
    expect(ActivitiesCard({ states, basePath: "/e/s/a/t" })).toBeNull();
  });

  // The distinction the coordinator asked to restore: a required, unpicked activity must be
  // visibly different from an optional or already-held one, not just first in the list.
  // Matches the "Pick one" badge `ActivityList` already puts on the same activity, so the two
  // surfaces agree.
  it("badges a required, unpicked activity 'Pick one', matching ActivityList's badge", () => {
    const tree = ActivitiesCard({ states: [state({ mustPick: true })], basePath: "/e/s/a/t" });
    const badge = findElement<{ children?: ReactNode }>(tree, Badge, (props) => props.children === "Pick one");
    expect(badge).not.toBeNull();
  });

  it("does not badge an activity nothing is owed on", () => {
    const tree = ActivitiesCard({ states: [state({ mustPick: false })], basePath: "/e/s/a/t" });
    expect(findElement(tree, Badge)).toBeNull();
  });
});
