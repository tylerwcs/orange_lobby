import { round2, stepPoints, type ChallengeWeek } from "@/lib/challenge";
import type { ChallengeScoring } from "@/lib/types";

/**
 * D375/D377/D380: every point in a scored challenge, worked out from live daily totals. Nothing
 * is stored, so a revoke, an edit or a disqualification shows on the next load, and a week
 * scored after it ended comes out exactly as one scored live.
 *
 * Whose km is it: Tier 1 and Tier 3 go to the team STAMPED on the entry (D369 - moving teams
 * does not carry km along). Tier 2 asks about the team's CURRENT members, wherever their km
 * was stamped, because "every member logged every day" is about the people on the team now.
 */

export type DailyTotal = { attendeeId: string; groupId: string | null; day: string; km: number };
export type Team = { id: string; name: string; memberIds: string[] };
export type TeamWeek = { km: number; tier1: number; bonus: number; podium: number; onTrack: number; members: number };
export type WeekResult = { week: ChallengeWeek; ended: boolean; teams: Record<string, TeamWeek> };
export type Standing = { id: string; name: string; km: number; tier1: number; bonus: number; podium: number; total: number; void: boolean; rank: number | null };
export type ChallengeScore = {
  weeks: WeekResult[];
  standings: Standing[];
  personKm: (attendeeId: string, day: string) => number;
};

/** Standard competition ranking: 1 + how many are strictly ahead, so a tie for 1st is 1, 1, 3. */
function rankOf<T>(items: T[], value: (x: T) => number, item: T): number {
  return 1 + items.filter((o) => value(o) > value(item)).length;
}

export function scoreChallenge(input: {
  totals: DailyTotal[];
  teams: Team[];
  disqualified: Set<string>;
  scoring: ChallengeScoring;
  weeks: ChallengeWeek[];
  today: string;
}): ChallengeScore {
  const { totals, teams, disqualified, scoring, weeks, today } = input;
  const steps = scoring.daily_steps ?? [];

  const byPersonDay = new Map<string, number>();
  for (const t of totals) {
    const k = `${t.attendeeId}|${t.day}`;
    byPersonDay.set(k, round2((byPersonDay.get(k) ?? 0) + t.km));
  }
  const personKm = (attendeeId: string, day: string) => byPersonDay.get(`${attendeeId}|${day}`) ?? 0;
  const logged = (attendeeId: string, day: string) => personKm(attendeeId, day) >= scoring.daily_min;
  const isVoid = new Set(teams.filter((t) => t.memberIds.some((id) => disqualified.has(id))).map((t) => t.id));

  const weekResults = weeks.map((week): WeekResult => {
    const ended = week.days[week.days.length - 1] < today;
    const inWeek = new Set(week.days);
    const elapsed = week.days.filter((d) => d < today);
    const result: Record<string, TeamWeek> = {};
    for (const team of teams) {
      let km = 0, tier1 = 0;
      for (const t of totals) {
        if (t.groupId !== team.id || !inWeek.has(t.day)) continue;
        km += t.km;
        tier1 += stepPoints(t.km, steps);
      }
      const allLogged = team.memberIds.length > 0 && team.memberIds.every((id) => week.days.every((d) => logged(id, d)));
      result[team.id] = {
        km: round2(km),
        tier1,
        bonus: ended && allLogged ? scoring.team_bonus ?? 0 : 0,
        podium: 0,
        onTrack: team.memberIds.filter((id) => elapsed.every((d) => logged(id, d))).length,
        members: team.memberIds.length,
      };
    }
    if (ended && scoring.podium?.length) {
      // D380: a Void team is out of the race, so the teams behind it move up.
      const racing = teams.filter((t) => !isVoid.has(t.id) && result[t.id].km > 0);
      for (const t of racing) {
        const rank = rankOf(racing, (x) => result[x.id].km, t);
        result[t.id].podium = scoring.podium[rank - 1] ?? 0;
      }
    }
    return { week, ended, teams: result };
  });

  const rows = teams.map((team) => {
    const sum = (k: "km" | "tier1" | "bonus" | "podium") => weekResults.reduce((n, w) => n + w.teams[team.id][k], 0);
    const [tier1, bonus, podium] = [sum("tier1"), sum("bonus"), sum("podium")];
    return { id: team.id, name: team.name, km: round2(sum("km")), tier1, bonus, podium, total: tier1 + bonus + podium, void: isVoid.has(team.id), rank: null as number | null };
  });
  const live = rows.filter((r) => !r.void).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  for (const r of live) r.rank = rankOf(live, (x) => x.total, r);
  const voided = rows.filter((r) => r.void).sort((a, b) => a.name.localeCompare(b.name));

  return { weeks: weekResults, standings: [...live, ...voided], personKm };
}
