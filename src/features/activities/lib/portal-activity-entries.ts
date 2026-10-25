import "server-only";
import { portalActivities, portalComingSoon, portalBookings } from "@/lib/portal";
import { listSessions, countBookingsBySession, submissionsForAttendee, submissionsForGroup, revokedForAttendee, revokedForGroup } from "../db/activities";
import { revokedFor } from "./revoked-entries";
import { listBooths, stampsForAttendee } from "../db/booths";
import { requestsForAttendee } from "../db/activity-requests";
import { bookingArrivalsFor } from "@/lib/db/checkins";
import { groupMembers, listGroups } from "@/lib/db/groups";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { activityState, eligible, type ActivityState } from "./activities";
import { activityControls, pendingFor, lastDeclinedFor, type ActivityControls } from "./activity-requests";
import { sessionArrivals } from "./booking-door";
import { canSubmit, isGroupForm, type SubmitState } from "./submissions";
import { groupProgress, type GroupProgress } from "@/lib/groups";
import { buildPassport, type Passport } from "./booths";
import { polaroidsForAttendee, type PolaroidRow } from "@/features/polaroid";
import { countedRows, isPicker, listSportsForActivities, loadBonus, loadResults, squadPeople, squadRows, type CupBonus, type SportResults, type SquadRow, type TournamentSport } from "@/features/tournaments";
import { otherActivityId, pairsForEvent, trackLabel, trackOf, trackRowsFor, trackStatus, type TrackPair, type TrackRow, type TrackStatus } from "@/features/tracks";
import { nowInKL } from "@/lib/time";
import type { Activity, ActivityKind, ActivitySubmission, Attendee, Event } from "@/lib/types";

export type ActivityEntry = { state: ActivityState; controls: ActivityControls; pendingId: string | null; arrivals: Record<string, string> };
/** D500: `revoked` is for display only - every count reads `mine` and `group`, which hold live rows (D501). */
export type SubmissionEntry = {
  form: Activity; state: SubmitState; mine: ActivitySubmission[]; group: GroupProgress | null; revoked: ActivitySubmission[];
  /** D725: where this attendee stands on the form's track pair; null when the form is in none. Optional so old fixtures compile. */
  track?: SubmissionTrack | null;
};
/** D724/D725: the attendee's own track ("Track A") and the pair's other activity, for the notes and link on My stats. */
export type SubmissionTrack = { pair: TrackPair; status: TrackStatus; mine: string | null; label: string; other: { id: string; name: string; label: string } };
/** A passport this attendee may collect on, and their card for it. Ineligible ones are left out (D184). */
export type PassportEntry = { activity: Activity; passport: Passport };
/** A polaroid wall this attendee may post to, and their own live polaroids on it (D482). */
export type PolaroidEntry = { activity: Activity; mine: PolaroidRow[] };
/**
 * A tournament this attendee's group plays in (D639), its sports, and its counted squad rows
 * (D643). Only for an attendee in a group: nobody else has a squad to see (D645).
 */
export type TournamentEntry = {
  activity: Activity; sports: TournamentSport[]; rows: SquadRow[]; attendeeId: string; groupId: string; picker: boolean;
  /** D663: every sport's pools, matches and slots, and the event's groups to name them. */
  results: SportResults[]; groups: { id: string; name: string }[];
  /** D674: the participation bonus and who earns it now; null when the tournament has none. */
  bonus: CupBonus | null;
};

/** Each kind's portal entry (D416). Its keys must be exactly ActivityKind: the check below fails the build otherwise. */
export type EntryMap = { booking: ActivityEntry; submission: SubmissionEntry; passport: PassportEntry; polaroid: PolaroidEntry; tournament: TournamentEntry };
export type ActivityEntries = { [K in keyof EntryMap]: EntryMap[K][] };
type Covers = [ActivityKind] extends [keyof EntryMap] ? ([keyof EntryMap] extends [ActivityKind] ? true : never) : never;
const covers: Covers = true;
void covers;

/**
 * Every activity one attendee can see, with what they hold in it and what they may do next -
 * the Activities tab's list and each activity's own page read the same answers from here.
 *
 * Reads the whole event's activities even for one activity's page. An event has a handful,
 * and one shape for both pages is worth more than the rows it saves; `portalActivities` and
 * `portalBookings` are memoised, so the layout's nav dot costs nothing extra.
 */
export async function loadActivityEntries(event: Pick<Event, "id" | "check_in_enabled">, attendee: Pick<Attendee, "id" | "category" | "group_id" | "extra">): Promise<ActivityEntries & {
  people: Record<string, { name: string; movedTo: string | null }>;
  /** D603: scheduled activities this attendee's category could use, for their Coming soon cards. */
  coming: Activity[];
}> {
  // Read first: whether any group reads are worth doing at all depends on it. Most attendees
  // are not in a group, and most events run no group form, so this keeps `groupMembers` and
  // `submissionsForGroup` off the hot path for every other page load.
  const [activities, scheduled, pairs] = await Promise.all([portalActivities(event.id), portalComingSoon(event.id), pairsForEvent(event.id)]);
  const hasGroupForm = attendee.group_id !== null && activities.some((a) => a.kind === "submission" && isGroupForm(a.group_mode));

  const [sessions, counts, mine, requests, submissions, booths, stamps, found, members, groupSubs, revokedMine, revokedGroup, trackRows] = await Promise.all([
    listSessions(event.id),
    countBookingsBySession(event.id),
    portalBookings(attendee.id),
    requestsForAttendee(attendee.id),
    submissionsForAttendee(attendee.id),
    listBooths(event.id),
    stampsForAttendee(attendee.id),
    event.check_in_enabled ? bookingArrivalsFor(attendee.id) : Promise.resolve([]),
    hasGroupForm ? groupMembers(event.id, attendee.group_id!) : Promise.resolve([]),
    hasGroupForm ? submissionsForGroup(attendee.group_id!) : Promise.resolve([]),
    revokedForAttendee(attendee.id),
    hasGroupForm ? revokedForGroup(attendee.group_id!) : Promise.resolve([]),
    // D725: only an event with a track pair has placements to read.
    pairs.length ? trackRowsFor(attendee.id) : Promise.resolve([] as TrackRow[]),
  ]);

  const mineBySession = new Set(mine.map((b) => b.session_id));
  const bookings = activities.filter((a) => a.kind === "booking").map((activity) => {
    const state = activityState({
      activity,
      sessions: sessions.filter((s) => s.activity_id === activity.id),
      counts,
      mine: mineBySession,
      category: attendee.category,
    });
    const pending = pendingFor(requests, activity.id);
    const controls = activityControls(state, pending, lastDeclinedFor(requests, activity.id));
    // `PendingSummary` deliberately carries no id (it is for rendering, not addressing), so
    // the raw pending request's id travels alongside `controls` for `withdraw` to bind to.
    return { state, controls, pendingId: pending?.id ?? null, arrivals: sessionArrivals(controls.held.map((h) => h.session), found) };
  });

  const today = nowInKL().date;
  const forms = activities.filter((a) => a.kind === "submission").map((form) => {
    const sent = submissions.filter((s) => s.activity_id === form.id);
    // D353: on a group form every member reads the same progress, built from the group's rows.
    const group = isGroupForm(form.group_mode) && attendee.group_id ? groupProgress(form, attendee.group_id, members, groupSubs) : null;
    const track = trackFor(form, pairs, trackRows, attendee, activities);
    return { form, state: canSubmit(form, sent, attendee.category, today, group, attendee.group_id, track?.status ?? null), mine: sent, group, revoked: revokedFor(form, revokedMine, revokedGroup), track };
  });

  // Names for every entry on show. A former member (D355) is not in `members`, so they are
  // looked up, with where they are now. Only then are the event's groups read.
  //
  // Drawn from `forms[*].group.entries`, not the raw `groupSubs` read: each form's `group` is
  // built by `groupProgress` (live rows only, that form's own activity), so this can't surface
  // someone from a revoked submission or from a form that no longer runs as a group form.
  const people: Record<string, { name: string; movedTo: string | null }> = Object.fromEntries(members.map((m) => [m.id, { name: m.name, movedTo: null }]));
  const groupEntryIds = new Set(forms.flatMap((f) => f.group?.entries.map((e) => e.attendee_id) ?? []));
  const former = [...groupEntryIds].filter((id) => !people[id]);
  if (former.length) {
    const [gone, groups] = await Promise.all([listAttendeesByIds(event.id, former), listGroups(event.id)]);
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    for (const a of gone) people[a.id] = { name: a.name, movedTo: a.group_id ? groupName.get(a.group_id) ?? null : null };
  }

  // Hidden outright when ineligible, like a booking: the booth would refuse them anyway, so a
  // card they can never fill is not something to show them.
  const passports = activities
    .filter((a) => a.kind === "passport" && eligible(a, attendee.category))
    .map((activity) => ({
      activity,
      passport: buildPassport(booths.filter((b) => b.activity_id === activity.id), stamps, activity.stamps_required),
    }));

  // Read only when the event runs a wall this attendee can see: most portal loads never do.
  const walls = activities.filter((a) => a.kind === "polaroid" && eligible(a, attendee.category));
  const myPolaroids = walls.length ? await polaroidsForAttendee(attendee.id) : [];
  const polaroids = walls.map((activity) => ({ activity, mine: myPolaroids.filter((p) => p.activity_id === activity.id) }));

  // D645: only someone in a group has squads. Read only when the event runs a tournament they can see.
  const groupId = attendee.group_id;
  const cups = groupId ? activities.filter((a) => a.kind === "tournament" && eligible(a, attendee.category)) : [];
  const tournaments = cups.length && groupId ? await loadTournaments(event.id, cups, attendee, groupId) : [];

  return {
    booking: bookings, submission: forms, passport: passports, polaroid: polaroids, tournament: tournaments, people,
    // A groupless attendee has no squads, so no Coming soon card for one either (D645).
    coming: scheduled.filter((a) => eligible(a, attendee.category) && (a.kind !== "tournament" || groupId !== null)),
  };
}

/** Each tournament's sports and counted rows (D643), people read once across all of them. */
async function loadTournaments(eventId: string, cups: Activity[], attendee: Pick<Attendee, "id" | "extra">, groupId: string): Promise<TournamentEntry[]> {
  const [sports, rowsByCup, resultsByCup, groups] = await Promise.all([
    listSportsForActivities(cups.map((a) => a.id)), Promise.all(cups.map((a) => squadRows(a.id))), Promise.all(cups.map((a) => loadResults(a.id))), listGroups(eventId),
  ]);
  const people = await squadPeople(eventId, rowsByCup.flat().map((r) => r.attendee_id));
  const counted = rowsByCup.map((rows) => countedRows(rows, people));
  const bonuses = await Promise.all(cups.map((a, i) => loadBonus(a, counted[i])));
  return cups.map((activity, i) => ({
    activity,
    sports: sports.filter((s) => s.activity_id === activity.id),
    rows: counted[i],
    attendeeId: attendee.id,
    groupId,
    picker: isPicker(activity, attendee),
    results: resultsByCup[i],
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    bonus: bonuses[i],
  }));
}

/** D725: the form's pair, if any, and where this attendee stands on it. The other activity's name falls back when it is hidden. */
function trackFor(form: Activity, pairs: TrackPair[], rows: TrackRow[], attendee: Pick<Attendee, "id" | "group_id">, activities: Activity[]): SubmissionTrack | null {
  const pair = pairs.find((p) => p.a_activity_id === form.id || p.b_activity_id === form.id);
  if (!pair) return null;
  const mine = trackOf(rows.filter((r) => r.pair_id === pair.id), attendee);
  const otherId = otherActivityId(pair, form.id);
  return {
    pair, mine, status: trackStatus(pair, form.id, mine)!, label: trackLabel(pair, form.id),
    other: { id: otherId, name: activities.find((a) => a.id === otherId)?.name ?? "the other track", label: trackLabel(pair, otherId) },
  };
}
