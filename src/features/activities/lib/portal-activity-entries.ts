import "server-only";
import { portalActivities, portalBookings } from "@/lib/portal";
import { listSessions, countBookingsBySession, submissionsForAttendee, submissionsForGroup } from "../db/activities";
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
import { nowInKL } from "@/lib/time";
import type { Activity, ActivityKind, ActivitySubmission, Attendee, Event } from "@/lib/types";

export type ActivityEntry = { state: ActivityState; controls: ActivityControls; pendingId: string | null; arrivals: Record<string, string> };
export type SubmissionEntry = { form: Activity; state: SubmitState; mine: ActivitySubmission[]; group: GroupProgress | null };
/** A passport this attendee may collect on, and their card for it. Ineligible ones are left out (D184). */
export type PassportEntry = { activity: Activity; passport: Passport };

/** Each kind's portal entry (D416). Its keys must be exactly ActivityKind: the check below fails the build otherwise. */
export type EntryMap = { booking: ActivityEntry; submission: SubmissionEntry; passport: PassportEntry };
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
export async function loadActivityEntries(event: Pick<Event, "id" | "check_in_enabled">, attendee: Pick<Attendee, "id" | "category" | "group_id">): Promise<ActivityEntries & {
  people: Record<string, { name: string; movedTo: string | null }>;
}> {
  // Read first: whether any group reads are worth doing at all depends on it. Most attendees
  // are not in a group, and most events run no group form, so this keeps `groupMembers` and
  // `submissionsForGroup` off the hot path for every other page load.
  const activities = await portalActivities(event.id);
  const hasGroupForm = attendee.group_id !== null && activities.some((a) => a.kind === "submission" && isGroupForm(a.group_mode));

  const [sessions, counts, mine, requests, submissions, booths, stamps, found, members, groupSubs] = await Promise.all([
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
    return { form, state: canSubmit(form, sent, attendee.category, today, group, attendee.group_id), mine: sent, group };
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

  return { booking: bookings, submission: forms, passport: passports, people };
}
