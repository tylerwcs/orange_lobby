import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import { stepPoints, unitOf } from "@/features/activities/client";
import type { Activity, Attendee, ChallengeScoring } from "@/lib/types";
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

/** D724: one row of My team on a track pair - the shown day on the person's OWN track. */
export type TeamTrackRow = { id: string; name: string; self: boolean; state: "logged" | "missing" | "future" | "none"; value: number; unit: string; pts: number | null };

/**
 * D724: My team on a track pair, by track. Each person reads their own track's total for the day,
 * so km left on A from before a move to B is not shown as theirs. As `teamDayRows`, the ones still
 * to log come first (D379) and a day still to come is "future" for everyone (D383). `logged` counts
 * members on either track who reached their track's daily minimum.
 */
export function trackTeamRows(input: {
  pair: TrackPair;
  members: (Pick<Attendee, "id" | "name" | "group_id"> & { cancelled_at?: string | null })[];
  rows: TrackRow[];
  /** Each person's total for `day` on Track A and on Track B. */
  totals: { a: Map<string, number>; b: Map<string, number> };
  scoring: { a: ChallengeScoring; b: ChallengeScoring };
  day: string; today: string; selfId: string;
}): { a: TeamTrackRow[]; b: TeamTrackRow[]; none: TeamTrackRow[]; logged: number } {
  const { pair, totals, scoring } = input;
  const split = splitTracks(pair, input.rows, input.members);
  const future = input.day > input.today;
  const rowsOf = (side: "a" | "b") => split[side].map((m): TeamTrackRow => {
    const value = totals[side].get(m.id) ?? 0;
    const s = scoring[side];
    const steps = s.daily_steps ?? [];
    const state = future ? "future" : value >= s.daily_min ? "logged" : "missing";
    return { id: m.id, name: m.name, self: m.id === input.selfId, state, value, unit: unitOf(s), pts: steps.length ? stepPoints(value, steps) : null };
  }).sort((x, y) => Number(x.state === "logged") - Number(y.state === "logged") || x.name.localeCompare(y.name));
  const a = rowsOf("a"), b = rowsOf("b");
  const none = split.none.map((m): TeamTrackRow => ({ id: m.id, name: m.name, self: m.id === input.selfId, state: "none", value: 0, unit: "", pts: null }))
    .sort((x, y) => x.name.localeCompare(y.name));
  return { a, b, none, logged: [...a, ...b].filter((r) => r.state === "logged").length };
}

/**
 * D724: what a captain's tap means, from what their page SHOWED - tapping the side the person was
 * shown on takes them off, the other side moves them there. Deciding from the server's current
 * state instead would turn a tap on a stale page (someone else just moved them) into the opposite.
 */
export function intendedTrack(pair: TrackPair, side: "a" | "b", shownOnSide: boolean): string | null {
  if (shownOnSide) return null;
  return side === "a" ? pair.a_activity_id : pair.b_activity_id;
}

/** D725: a captain sending for someone off this track is told about that person, not about themselves. Null for any other code. */
export function memberTrackRefusal(code: string, memberName: string): string | null {
  if (code === "notrack") return `${memberName} isn't on a track yet. Put them on one from My team first.`;
  if (code === "othertrack") return `${memberName} is on the other track. Submit for them there instead.`;
  return null;
}
