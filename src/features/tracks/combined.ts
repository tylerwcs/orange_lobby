import type { ChallengeScore, ChallengeWeek, Standing, Team } from "@/features/activities/client";
import type { ChallengeScoring } from "@/lib/types";

/**
 * D727: one team score from a track pair - each track's own score (`scoreChallenge`, unchanged:
 * Tier 1, its own podium, its ad hoc points) added up, plus the pair's weekly bonus, which asks
 * about both tracks at once. Pure, and nothing is stored, so a revoke or a move shows on the next
 * load (D375).
 */

/** A team's week: each track's Tier 1 + podium, and the pair's bonus. `void` voids all three (D726). */
export type PairTeamWeek = { a: number; b: number; bonus: number; onTrack: number; members: number; void: boolean };
export type PairWeek = { week: ChallengeWeek; ended: boolean; teams: Record<string, PairTeamWeek> };
/** `a` and `b` are each track's tier1 + podium + ad hoc points; `total` adds the bonus. `km` and `volumeRank` are unused (0, null). */
export type PairStanding = Standing & { a: number; b: number };
export type PairScore = { weeks: PairWeek[]; standings: PairStanding[] };

/** D726: a disqualification counts on both tracks. A season void (null) wins; otherwise the earliest week. */
export function mergeDisqualified(a: Map<string, string | null>, b: Map<string, string | null>): Map<string, string | null> {
  const out = new Map(a);
  for (const [id, week] of b) {
    if (!out.has(id)) out.set(id, week);
    else {
      const mine = out.get(id)!;
      out.set(id, mine === null || week === null ? null : week < mine ? week : mine);
    }
  }
  return out;
}

/** The pair's weeks line up only when both tracks have the same dates and week numbering. */
export function sameCalendar(a: ChallengeScoring, b: ChallengeScoring): boolean {
  return a.starts_on === b.starts_on && a.ends_on === b.ends_on && (a.week_origin ?? "event") === (b.week_origin ?? "event");
}

/** Standard competition ranking, as `scoreChallenge`'s: a tie for 1st is 1, 1, 3. */
function rankOf<T>(items: T[], value: (x: T) => number, item: T): number {
  return 1 + items.filter((o) => value(o) > value(item)).length;
}

export function scorePair(input: { a: ChallengeScore; b: ChallengeScore; aScoring: ChallengeScoring; bScoring: ChallengeScoring; teams: Team[]; bonus: number; today: string }): PairScore {
  const { a, b, aScoring, bScoring, teams, today } = input;
  // A day counts on either track: 1 km on A, or 20 minutes on B.
  const logged = (id: string, day: string) => a.personKm(id, day) >= aScoring.daily_min || b.personKm(id, day) >= bScoring.daily_min;

  const weeks = a.weeks.map((wa, i): PairWeek => {
    const wb = b.weeks[i];
    const { week, ended } = wa;
    const elapsed = week.days.filter((d) => d < today);
    const result: Record<string, PairTeamWeek> = {};
    for (const team of teams) {
      const ta = wa.teams[team.id], tb = wb.teams[team.id];
      const voided = ta.void || tb.void;
      // The disqualification lists are merged (D726), so either track's `counts` is the pair's.
      const members = team.memberIds.filter((id) => a.counts(id, week.days[0]));
      const allLogged = members.length > 0 && members.every((id) => week.days.every((d) => logged(id, d)));
      result[team.id] = {
        a: voided ? 0 : ta.tier1 + ta.podium,
        b: voided ? 0 : tb.tier1 + tb.podium,
        bonus: !voided && ended && allLogged ? input.bonus : 0,
        onTrack: members.filter((id) => elapsed.every((d) => logged(id, d))).length,
        members: members.length,
        void: voided,
      };
    }
    return { week, ended, teams: result };
  });

  const rows = teams.map((team): PairStanding => {
    const sa = a.standings.find((s) => s.id === team.id)!, sb = b.standings.find((s) => s.id === team.id)!;
    const isVoid = sa.void || sb.void;
    const ptsA = sa.tier1 + sa.podium + sa.adjust, ptsB = sb.tier1 + sb.podium + sb.adjust;
    const bonus = isVoid ? 0 : weeks.reduce((n, w) => n + w.teams[team.id].bonus, 0);
    return {
      id: team.id, name: team.name, km: 0, volumeRank: null, rank: null, void: isVoid,
      tier1: sa.tier1 + sb.tier1, podium: sa.podium + sb.podium, adjust: sa.adjust + sb.adjust, bonus,
      a: ptsA, b: ptsB, total: isVoid ? 0 : ptsA + ptsB + bonus,
    };
  });
  const live = rows.filter((r) => !r.void).sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
  for (const r of live) r.rank = rankOf(live, (x) => x.total, r);
  const voided = rows.filter((r) => r.void).sort((x, y) => x.name.localeCompare(y.name));
  return { weeks, standings: [...live, ...voided] };
}
