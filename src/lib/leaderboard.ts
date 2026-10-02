import type { Standing } from "@/lib/challenge-score";
import { shortDate } from "@/lib/text";

/**
 * D386: what the attendee's Leaderboard tab says, from `scoreChallenge`'s standings (live teams by
 * total, competition-ranked; void teams last with no rank). Points only - a team's km never shows
 * here, so the weekly podium stays a surprise (D379). Pure; the component only draws it.
 */

export const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

export type LeaderboardView = {
  /** False until some live team has a point: the podium then stays a row of empty places. */
  scored: boolean;
  /** The first three live teams in standings order, with their real ranks (a tie for 1st is 1, 1). */
  podium: Standing[];
  /** Everyone not on the podium, void teams last; every team while nothing is scored. */
  rest: Standing[];
  /** What a bar measures against: the leader's total is a full bar. */
  leaderTotal: number;
};

export function leaderboardView(standings: Standing[]): LeaderboardView {
  const live = standings.filter((s) => !s.void);
  const scored = live.some((s) => s.total > 0);
  const podium = scored ? live.slice(0, 3) : [];
  const onPodium = new Set(podium.map((s) => s.id));
  return { scored, podium, rest: standings.filter((s) => !onPodium.has(s.id)), leaderTotal: live[0]?.total ?? 0 };
}

export type StandingLine = { rank: string; title: string; line: string };

/**
 * The "Where you stand" card: the viewer's team's rank, its points, and the gap that matters -
 * to the team just above (the row above the viewer's tie, not a twin on the same total), and,
 * below 3rd, to the podium's third team. Null when the viewer has no team on the table.
 *
 * Before any team has a point every team ties for 1st, which says nothing, so the rank is "–" and
 * the line says when the race starts (`timing`), or, once it has, that nobody has scored yet.
 */
export function standingLine(standings: Standing[], myTeamId: string | null, timing?: { startsOn: string; today: string }): StandingLine | null {
  const me = myTeamId ? standings.find((s) => s.id === myTeamId) : undefined;
  if (!me) return null;
  if (me.void || me.rank === null) return { rank: "–", title: `${me.name} · Void`, line: "Your team is void: a member was disqualified." };

  const title = `${me.name} · ${pts(me.total)}`;
  const live = standings.filter((s) => !s.void);
  if (!live.some((s) => s.total > 0)) {
    const line = timing && timing.today < timing.startsOn ? `The race starts ${shortDate(timing.startsOn)}.` : "No team has points yet.";
    return { rank: "–", title, line };
  }

  const rank = `#${me.rank}`;
  if (me.rank === 1) {
    const tied = live.some((s) => s.id !== me.id && s.total === me.total);
    const second = live.find((s) => s.total < me.total);
    return { rank, title, line: tied ? "Tied for 1st." : second ? `Leading by ${pts(me.total - second.total)}.` : "Your team is in the lead." };
  }
  // Standings run highest first, so the last team with more points is the one just above.
  const above = live.filter((s) => s.total > me.total).at(-1)!;
  let line = `${pts(above.total - me.total)} behind ${above.name}.`;
  if (me.rank > 3) line += ` ${pts(live[2].total - me.total)} to reach the podium.`;
  return { rank, title, line };
}
