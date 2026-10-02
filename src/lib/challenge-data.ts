import "server-only";
import { challengeWeeks, type ChallengeWeek } from "@/lib/challenge";
import { scoreChallenge, type ChallengeScore, type Team } from "@/lib/challenge-score";
import { dailyTotals, listDisqualifications, type Disqualification } from "@/lib/db/challenge";
import { listGroups } from "@/lib/db/groups";
import { listAttendees } from "@/lib/db/attendees";
import type { Activity, Event } from "@/lib/types";

/**
 * D375: the one read behind every leaderboard - the portal's team table and My team, the admin
 * tab and the export all score from here, so they cannot disagree. Four queries; the event's
 * attendee list (~160 rows) is what tells Tier 2 who is on each team now.
 */
export async function loadChallenge(event: Pick<Event, "id" | "starts_on">, activity: Activity, today: string): Promise<{
  score: ChallengeScore;
  teams: Team[];
  weeks: ChallengeWeek[];
  names: Map<string, string>;
  disqualifications: Disqualification[];
}> {
  const scoring = activity.scoring!;
  const [totals, groups, attendees, disqualifications] = await Promise.all([
    dailyTotals(activity.id), listGroups(event.id), listAttendees(event.id), listDisqualifications(activity.id),
  ]);
  const teams = groups.map((g) => ({
    id: g.id, name: g.name,
    memberIds: attendees.filter((a) => a.group_id === g.id).map((a) => a.id),
  }));
  const weeks = challengeWeeks(scoring, event.starts_on);
  const score = scoreChallenge({ totals, teams, disqualified: new Set(disqualifications.map((d) => d.attendee_id)), scoring, weeks, today });
  return { score, teams, weeks, names: new Map(attendees.map((a) => [a.id, a.name])), disqualifications };
}
