import { ChevronDown } from "lucide-react";
import { stepPoints, type ChallengeWeek } from "@/lib/challenge";
import { teamDayRows } from "@/lib/tracker";
import { shortDate } from "@/lib/text";
import type { ChallengeScore, Team, TeamWeek } from "@/lib/challenge-score";
import type { ChallengeScoring } from "@/lib/types";

/**
 * D379: the viewer's own team - who has logged on the shown day (the ones still to log first,
 * so teammates can nudge), Tier 2 progress, and the team's own km for the week. The only km of
 * any team the portal shows, and only to that team's members.
 *
 * D386: it sits under the Leaderboard, closed - a native <details>, so it needs no client JS - and
 * its summary row is the news a teammate wants first: how many have logged today and the week's
 * km. The Leaderboard passes today (moved inside the challenge's dates) and the current week.
 *
 * The Tier 2 line depends on where the shown week sits against today: only the current week has
 * a "so far" (before it starts, or on its first day, everyone counts as on track, which would mislead), and a past
 * week is settled, so it says what happened. A future week says nothing.
 *
 * A day still to come shows "–" for everyone rather than "Not logged" (D383): nobody can have
 * logged it yet, and before the challenge starts the shown day is its first.
 */
export function MyTeam({ team, week, weekInfo, score, scoring, day, today, selfId, names }: {
  team: Team; week: TeamWeek; weekInfo: ChallengeWeek; score: ChallengeScore; scoring: ChallengeScoring;
  day: string; today: string; selfId: string; names: Map<string, string>;
}) {
  const steps = scoring.daily_steps ?? [];
  const rows = teamDayRows({ memberIds: team.memberIds, names, kmOf: (id) => score.personKm(id, day), dailyMin: scoring.daily_min, day, today });
  const bonus = scoring.team_bonus ?? 0;
  const first = weekInfo.days[0];
  const last = weekInfo.days[weekInfo.days.length - 1];
  // On the week's first day nothing has elapsed, so "M of M so far" would say nothing true.
  const current = first < today && today <= last;
  const past = last < today;
  const logged = rows.filter((r) => r.state === "logged").length;
  const summary = today < scoring.starts_on
    ? `Starts ${shortDate(scoring.starts_on)}`
    : today > scoring.ends_on
      ? `Ended ${shortDate(scoring.ends_on)} · ${week.km} km in the last week`
      : `${logged} of ${rows.length} logged today · ${week.km} km this week`;
  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card">
      <summary className="flex min-h-14 list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-extrabold">My team · {team.name}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">{summary}</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 border-t border-border p-3">
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
        <ul className="flex flex-col overflow-hidden rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
              <span className="min-w-0 flex-1 truncate">{r.name}{r.id === selfId ? " (you)" : ""}</span>
              {r.state === "future"
                ? <span className="text-muted-foreground"><span aria-hidden>–</span><span className="sr-only">Not yet</span></span>
                : r.state === "logged"
                  ? <span className="tabular-nums text-muted-foreground">{r.km} km{steps.length ? ` · ${stepPoints(r.km, steps)} pts` : ""}</span>
                  : <span className="font-bold text-warning">Not logged</span>}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
