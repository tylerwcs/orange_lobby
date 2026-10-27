import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import { isOwnSubmissionPath } from "@/lib/storage";
import { stepPoints, unitOf } from "@/features/activities/client";
import type { Activity, Attendee, ChallengeScoring } from "@/lib/types";
import type { TrackHistoryRow, TrackPair, TrackRow, TrackStatus } from "./types";

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
    // D726: a day logged only on the other track (before a move) shows that track's numbers, not "Not logged".
    const other = side === "a" ? "b" : "a";
    const read = (totals[side].get(m.id) ?? 0) === 0 && (totals[other].get(m.id) ?? 0) > 0 ? other : side;
    const value = totals[read].get(m.id) ?? 0;
    const s = scoring[read];
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
  if (code === "trackfull") return `${memberName}'s team already has its places on this track taken today.`;
  return null;
}

/**
 * D724: a row's A | B switch. A placed member's row keeps its space for their day's numbers, so a
 * captain sees the switch only on someone with no track - or on every row while changing tracks.
 */
export function showTrackSwitch(input: { captain: boolean; placed: boolean; changing: boolean; isToday: boolean }): boolean {
  // D731: another day's view shows how the team stood then, so it offers no changes.
  return input.captain && input.isToday && (!input.placed || input.changing);
}

/** An entry as read just before a track move, for `goneEntryFiles`. */
export type MovedEntry = { id: string; activity_id: string; answers: Record<string, string>; pair_id: string | null };

/**
 * D726: the photos to delete after a track move removed the person's entries from today - only
 * entries that are gone now (`stillThere` holds the ids that survived), only files in that
 * activity's own folder, and never a pair entry's, whose files the partner's entry still shows.
 */
export function goneEntryFiles(before: MovedEntry[], stillThere: Set<string>, at: { orgId: string; eventId: string }): string[] {
  return before
    .filter((e) => !stillThere.has(e.id) && e.pair_id === null)
    .flatMap((e) => Object.values(e.answers).filter((v) => isOwnSubmissionPath({ orgId: at.orgId, eventId: at.eventId, formId: e.activity_id }, v)));
}

/**
 * D730: whether this attendee's team has its places on this track taken today - `target` people
 * have logged on it - and this attendee isn't one of them. Someone already counted may log again.
 * `logged` is the team's live entries today on the pair, one row per entry.
 */
export function trackFullFor(logged: { attendee_id: string; activity_id: string }[], activityId: string, attendeeId: string, target: number): boolean {
  const people = new Set(logged.filter((r) => r.activity_id === activityId).map((r) => r.attendee_id));
  return !people.has(attendeeId) && people.size >= target;
}

/**
 * D731: everyone's track on one day, as placement rows `trackOf` reads - each person's latest
 * change on or before the day (the day's last change wins), leaving out anyone taken off. Someone
 * with no known track that day but an entry on one (placed before this history began) is put on
 * the track they logged on.
 */
export function placementsOn(history: TrackHistoryRow[], day: string, loggedThatDay: { attendee_id: string; activity_id: string; group_id: string }[] = []): TrackRow[] {
  const latest = new Map<string, TrackHistoryRow>();
  for (const h of [...history].sort((x, y) => x.day.localeCompare(y.day) || x.at.localeCompare(y.at))) {
    if (h.day <= day) latest.set(h.attendee_id, h);
  }
  const rows: TrackRow[] = [...latest.values()]
    .filter((h) => h.activity_id !== null)
    .map((h) => ({ pair_id: h.pair_id, attendee_id: h.attendee_id, group_id: h.group_id, activity_id: h.activity_id! }));
  const pairId = history[0]?.pair_id ?? "";
  for (const l of loggedThatDay) {
    if (!latest.has(l.attendee_id)) rows.push({ pair_id: pairId, attendee_id: l.attendee_id, group_id: l.group_id, activity_id: l.activity_id });
  }
  return rows;
}
