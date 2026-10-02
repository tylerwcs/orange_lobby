import Link from "next/link";
import { weekLabel } from "@/lib/challenge";
import type { ChallengeScore } from "@/lib/challenge-score";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * D381: the committee's full view - km and every tier, for all weeks or one. Teams link to their
 * member × day grid. "Week" here is the EDM's numbering (D378).
 */
export function LeaderboardPanel({ score, week, today, href }: {
  score: ChallengeScore;
  /** Null is every week so far. */
  week: number | null;
  /** `nowInKL().date` from the page - weeks not yet begun get no chip. */
  today: string;
  href: (extra: Record<string, string>) => string;
}) {
  const picked = week === null ? null : score.weeks.find((w) => w.week.number === week) ?? null;
  const rows = score.standings.map((s) => {
    const w = picked?.teams[s.id];
    return w ? { ...s, km: w.km, tier1: w.tier1, bonus: w.bonus, podium: w.podium, total: w.tier1 + w.bonus + w.podium } : s;
  });
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
            <TableHead className="text-right">km</TableHead><TableHead className="text-right">Daily</TableHead>
            <TableHead className="text-right">Bonus</TableHead><TableHead className="text-right">Podium</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.rank ?? "–"}</TableCell>
              <TableCell><Link href={href({ ...(week ? { week: String(week) } : {}), team: r.id })} className="font-bold text-primary underline-offset-2 hover:underline">{r.name}</Link></TableCell>
              <TableCell className="text-right tabular-nums">{r.km}</TableCell>
              <TableCell className="text-right tabular-nums">{r.tier1}</TableCell>
              <TableCell className="text-right tabular-nums">{r.bonus}</TableCell>
              <TableCell className="text-right tabular-nums">{r.podium}</TableCell>
              <TableCell className="text-right font-extrabold tabular-nums">{r.void ? "Void" : r.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
