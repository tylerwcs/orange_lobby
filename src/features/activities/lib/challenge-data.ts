import "server-only";
import { challengeWeeks, type ChallengeWeek } from "./challenge";
import { scoreChallenge, type ChallengeScore, type Team } from "./challenge-score";
import { dailyTotals, listDisqualifications, type Disqualification } from "../db/challenge";
import { listGroups } from "@/lib/db/groups";
import { listAttendees } from "@/lib/db/attendees";
import type { Activity, Attendee, Event, EventGroup } from "@/lib/types";
import { loadAdjustmentTotals } from "@/features/adjustments";

/**
 * D375: the one read behind every leaderboard - the portal's team table and My team, the admin
 * tab and the export all score from here, so they cannot disagree, D705's ad hoc points included. Five queries; the event's
 * attendee list (~160 rows) is what tells Tier 2 who is on each team now.
 */
export async function loadChallenge(event: Pick<Event, "id" | "starts_on">, activity: Activity, today: string): Promise<{
  score: ChallengeScore;
  teams: Team[];
  weeks: ChallengeWeek[];
  names: Map<string, string>;
  disqualifications: Disqualification[];
  /** D516: the rows this read already has, so the leaderboard's rosters need no second query. */
  groups: EventGroup[];
  attendees: Attendee[];
}> {
  const scoring = activity.scoring!;
  // D582: cancelled people are read too. A disqualification stays on the team they cancelled from
  // (cancelling must not lift a void) and their names stay on past entries, but they are not
  // members for the bonus, the counts or the rosters.
  const [totals, groups, everyone, disqualifications, adjustments] = await Promise.all([
    dailyTotals(activity.id), listGroups(event.id), listAttendees(event.id, undefined, "wide", { includeCancelled: true }), listDisqualifications(activity.id),
    loadAdjustmentTotals(activity.id),
  ]);
  const attendees = everyone.filter((a) => !a.cancelled_at);
  const teams = groups.map((g) => ({
    id: g.id, name: g.name,
    memberIds: attendees.filter((a) => a.group_id === g.id).map((a) => a.id),
    cancelledIds: everyone.filter((a) => a.cancelled_at && a.group_id === g.id).map((a) => a.id),
  }));
  const weeks = challengeWeeks(scoring, event.starts_on);
  const disqualified = new Map(disqualifications.map((d) => [d.attendee_id, d.week_of]));
  const score = scoreChallenge({ totals, teams, disqualified, scoring, weeks, today, adjustments });
  return { score, teams, weeks, names: new Map(everyone.map((a) => [a.id, a.name])), disqualifications, groups, attendees };
}
