import Link from "next/link";
import { weekLabel } from "../../../lib/challenge";
import { weekStandings, type ChallengeScore } from "../../../lib/challenge-score";
import { rankByTotal } from "../../../lib/leaderboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * D381: the committee's full view - km and every tier, for all weeks or one. Teams link to their
 * member × day grid. "Week" here is the EDM's numbering (D378). The all-weeks view also shows each
 * team's Ultra-Effort rank (D468) beside its total; a picked week does not.
 */
export function LeaderboardPanel({ score, unit, week, today, href }: {
  score: ChallengeScore;
  /** The challenge's unit (D463), heading the total column. */
  unit: string;
  /** Null is every week so far. */
  week: number | null;
  /** `nowInKL().date` from the page - weeks not yet begun get no chip. */
  today: string;
  href: (extra: Record<string, string>) => string;
}) {
  const picked = week === null ? null : score.weeks.find((w) => w.week.number === week) ?? null;
  // A picked week is ranked on its own numbers (`rankByTotal`), not on the all-weeks standings it
  // would otherwise inherit its order and "#" from. A team-week voided on its own (D467) is Void in that week only.
  const rows = picked ? rankByTotal(weekStandings(score.standings, picked)) : score.standings;
  // D705/D813: the Ad hoc column shows whenever the rows have some - every one on All weeks, a week's own in a week.
  const adjusted = rows.some((r) => r.adjust !== 0);
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-bold ${active ? "border-primary bg-primary/10 text-primary" : "border-border"}`;
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap gap-1.5" aria-label="Week">
        <Link href={href({})} className={chip(week === null)}>All weeks</Link>
        {score.weeks.filter((w) => w.week.days[0] <= today).map((w) => (
          <Link key={w.week.number} href={href({ week: String(w.week.number) })} className={chip(week === w.week.number)}>
            Week {w.week.number}{w.ended ? "" : " (live)"}
          </Link>
        ))}
      </nav>
      {picked && <p className="text-sm text-muted-foreground">{weekLabel(picked.week)}{picked.ended ? "" : ". Bonus and podium are added once the week ends."}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead><TableHead>Team</TableHead>
            <TableHead className="text-right" title={picked ? undefined : "Season total, with its Ultra-Effort rank"}>{unit}{!picked && " · Ultra-Effort"}</TableHead><TableHead className="text-right">Daily</TableHead>
            <TableHead className="text-right">Participation</TableHead><TableHead className="text-right">Podium</TableHead>
            {adjusted && <TableHead className="text-right" title="Ad hoc points from the organisers">Ad hoc</TableHead>}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.rank ?? "–"}</TableCell>
              <TableCell><Link href={href({ ...(week ? { week: String(week) } : {}), team: r.id })} className="font-bold text-primary underline-offset-2 hover:underline">{r.name}</Link></TableCell>
              <TableCell className="text-right tabular-nums">
                {r.km}
                {!picked && r.volumeRank !== null && <span className="ml-1.5 text-xs font-bold text-muted-foreground" title="Ultra-Effort rank">#{r.volumeRank}</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.tier1}</TableCell>
              <TableCell className="text-right tabular-nums">{r.bonus}</TableCell>
              <TableCell className="text-right tabular-nums">{r.podium}</TableCell>
              {adjusted && <TableCell className="text-right tabular-nums">{r.adjust > 0 ? `+${r.adjust}` : r.adjust}</TableCell>}
              <TableCell className="text-right font-extrabold tabular-nums">{r.void ? "Void" : r.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
