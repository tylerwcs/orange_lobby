import "server-only";
import { loadPortalAttendee } from "@/lib/portal";
import { categoryMatches } from "@/lib/agenda";
import { pairActivities, pairForActivity } from "./db";
import { isTrackCaptain } from "./lib";
import type { Activity, Attendee, Event } from "@/lib/types";
import type { TrackPair } from "./types";

/** Everything a portal track change needs. `activities` are Track A then Track B. */
export type TrackContext = { event: Event; attendee: Attendee; pair: TrackPair; activities: [Activity, Activity]; captain: boolean };

/**
 * A portal attendee acting on a track pair from their own link (D723, D724). Null for anyone who
 * can't: a cancelled or groupless attendee, an activity in no pair, or one outside their category.
 * `set_challenge_track` re-checks all of it; this is what the page offers.
 */
export async function portalTrackContext(slug: string, token: string, activityId: string): Promise<TrackContext | null> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (attendee.cancelled_at || !attendee.group_id) return null;
  const pair = await pairForActivity(activityId);
  if (!pair || pair.event_id !== event.id) return null;
  const both = await pairActivities(pair);
  if (!both) return null;
  const [a, b] = both;
  const here = activityId === a.id ? a : b;
  if (!categoryMatches(here.categories, attendee.category)) return null;
  return { event, attendee, pair, activities: [a, b], captain: isTrackCaptain([a, b], attendee) };
}
