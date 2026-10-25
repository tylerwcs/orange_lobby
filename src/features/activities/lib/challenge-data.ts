import "server-only";
import { challengeWeeks, type ChallengeWeek } from "./challenge";
import { scoreChallenge, type ChallengeScore, type Team } from "./challenge-score";
import { dailyTotals, listDisqualifications, type Disqualification } from "../db/challenge";
import { listGroups } from "@/lib/db/groups";
import { listAttendees } from "@/lib/db/attendees";
import type { Activity, Attendee, Event, EventGroup } from "@/lib/types";
import { loadAdjustmentTotals } from "@/features/adjustments";
import { mergeDisqualified, otherActivityId, pairActivities, pairForActivity, sameCalendar, scorePair, type PairScore, type TrackPair } from "@/features/tracks";

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
  const [totals, groups, everyone, disqualifications, adjustments, pair] = await Promise.all([
    dailyTotals(activity.id), listGroups(event.id), listAttendees(event.id, undefined, "wide", { includeCancelled: true }), listDisqualifications(activity.id),
    loadAdjustmentTotals(activity.id), pairForActivity(activity.id),
  ]);
  // D726: on a track pair a disqualification counts on both tracks, so each track scores with both lists.
  const otherDisqualifications = pair ? await listDisqualifications(otherActivityId(pair, activity.id)) : [];
  const attendees = everyone.filter((a) => !a.cancelled_at);
  const teams = groups.map((g) => ({
    id: g.id, name: g.name,
    memberIds: attendees.filter((a) => a.group_id === g.id).map((a) => a.id),
    cancelledIds: everyone.filter((a) => a.cancelled_at && a.group_id === g.id).map((a) => a.id),
  }));
  const weeks = challengeWeeks(scoring, event.starts_on);
  const disqualified = mergeDisqualified(
    new Map(disqualifications.map((d) => [d.attendee_id, d.week_of])),
    new Map(otherDisqualifications.map((d) => [d.attendee_id, d.week_of])),
  );
  const score = scoreChallenge({ totals, teams, disqualified, scoring, weeks, today, adjustments });
  return { score, teams, weeks, names: new Map(everyone.map((a) => [a.id, a.name])), disqualifications, groups, attendees };
}

export type PairChallenge = { ok: true; score: PairScore; a: Awaited<ReturnType<typeof loadChallenge>>; b: Awaited<ReturnType<typeof loadChallenge>>; activities: [Activity, Activity] } | { ok: false; reason: string };

/**
 * D727: a track pair's one team score - both tracks read through `loadChallenge` (so every board
 * agrees with each track's own) and added up by `scorePair`. Refuses, with the sentence the
 * committee reads, when the two tracks' weeks would not line up.
 */
export async function loadPairScore(event: Pick<Event, "id" | "starts_on">, pair: TrackPair, today: string): Promise<PairChallenge> {
  const both = await pairActivities(pair);
  if (!both || !both[0].scoring || !both[1].scoring) return { ok: false, reason: "Both tracks need to be scored challenges." };
  if (!sameCalendar(both[0].scoring, both[1].scoring)) return { ok: false, reason: "The two tracks must have the same dates and week numbering." };
  const [a, b] = await Promise.all([loadChallenge(event, both[0], today), loadChallenge(event, both[1], today)]);
  const score = scorePair({ a: a.score, b: b.score, aScoring: both[0].scoring, bScoring: both[1].scoring, teams: a.teams, bonus: pair.bonus, today });
  return { ok: true, score, a, b, activities: both };
}
