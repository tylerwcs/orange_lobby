import { stepPoints, type ChallengeWeek } from "@/lib/challenge";
import type { ChallengeScore, Team, TeamWeek } from "@/lib/challenge-score";
import type { ChallengeScoring } from "@/lib/types";

/**
 * D379: the viewer's own team - who has logged on the shown day (the ones still to log first,
 * so teammates can nudge), Tier 2 progress, and the team's own km for the week.
 *
 * The Tier 2 line depends on where the shown week sits against today: only the current week has
 * a "so far" (before it starts, or on its first day, everyone counts as on track, which would mislead), and a past
 * week is settled, so it says what happened. A future week says nothing.
 */
export function MyTeam({ team, week, weekInfo, score, scoring, day, today, selfId, names }: {
  team: Team; week: TeamWeek; weekInfo: ChallengeWeek; score: ChallengeScore; scoring: ChallengeScoring;
  day: string; today: string; selfId: string; names: Map<string, string>;
}) {
  const steps = scoring.daily_steps ?? [];
  const rows = team.memberIds
    .map((id) => ({ id, name: names.get(id) ?? "Unknown", km: score.personKm(id, day) }))
    .sort((a, b) => Number(a.km >= scoring.daily_min) - Number(b.km >= scoring.daily_min) || a.name.localeCompare(b.name));
  const bonus = scoring.team_bonus ?? 0;
  const first = weekInfo.days[0];
  const last = weekInfo.days[weekInfo.days.length - 1];
  // On the week's first day nothing has elapsed, so "M of M so far" would say nothing true.
  const current = first < today && today <= last;
  const past = last < today;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-extrabold">{team.name}</h2>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{week.km} km this week</span>
      </div>
      {bonus > 0 && current && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="font-bold">{week.onTrack} of {week.members}</span> logged every day so far this week. Everyone logging every day earns +{bonus}.
        </p>
      )}
      {bonus > 0 && past && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          {week.bonus > 0 ? `Everyone logged every day: +${week.bonus}.` : "Not everyone logged every day this week."}
        </p>
      )}
      <ul className="flex flex-col overflow-hidden rounded-xl border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
            <span className="min-w-0 flex-1 truncate">{r.name}{r.id === selfId ? " (you)" : ""}</span>
            {r.km >= scoring.daily_min
              ? <span className="tabular-nums text-muted-foreground">{r.km} km{steps.length ? ` · ${stepPoints(r.km, steps)} pts` : ""}</span>
              : <span className="font-bold text-warning">Not logged</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
