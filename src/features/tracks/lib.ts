import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import type { Activity, Attendee } from "@/lib/types";
import type { TrackPair, TrackRow, TrackStatus } from "./types";

/** The pure rules of a track pair (D722-D725). The database decides what is allowed; these decide what the page draws. */

type Person = Pick<Attendee, "id" | "group_id"> & { cancelled_at?: string | null };

/** D722: the activity this person is on, or null - a row from another group (a team move) or a cancelled person counts for nothing. */
export function trackOf(rows: TrackRow[], person: Person): string | null {
  if (person.cancelled_at || !person.group_id) return null;
  return rows.find((r) => r.attendee_id === person.id && r.group_id === person.group_id)?.activity_id ?? null;
}

/** D725: null when the activity is in no pair, which is every activity but the two tracks. */
export function trackStatus(pair: TrackPair | null, activityId: string, track: string | null): TrackStatus | null {
  if (!pair) return null;
  if (track === null) return "none";
  return track === activityId ? "this" : "other";
}

export function otherActivityId(pair: TrackPair, activityId: string): string {
  return activityId === pair.a_activity_id ? pair.b_activity_id : pair.a_activity_id;
}

export function trackLabel(pair: TrackPair, activityId: string): "Track A" | "Track B" {
  return activityId === pair.a_activity_id ? "Track A" : "Track B";
}

/** D724: a team's members by track, in the order given. Cancelled members are on no list. */
export function splitTracks<T extends Person>(pair: TrackPair, rows: TrackRow[], members: T[]): { a: T[]; b: T[]; none: T[] } {
  const split = { a: [] as T[], b: [] as T[], none: [] as T[] };
  for (const m of members) {
    if (m.cancelled_at) continue;
    const t = trackOf(rows, m);
    (t === pair.a_activity_id ? split.a : t === pair.b_activity_id ? split.b : split.none).push(m);
  }
  return split;
}

/** D723: a Yes in a field ticked on either activity of the pair - D392's `isProxy` over both. */
export function isTrackCaptain(activities: Pick<Activity, "proxy_fields">[], attendee: Pick<Attendee, "extra">): boolean {
  return activities.some((a) => a.proxy_fields.some((k) => isYes(fieldValue(attendee, k))));
}
