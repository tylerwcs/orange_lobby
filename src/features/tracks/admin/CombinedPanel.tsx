import Link from "next/link";
import { rankByTotal, weekLabel } from "@/features/activities/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pairWeekStandings, type PairScore } from "../combined";

/**
 * D728: the committee's view of a track pair's one team score - each track's points (Tier 1,
 * podium and, on All weeks, ad hoc), the pair's bonus and the total - for all weeks or one, with
 * the same week chips as the per-track panel below it. A picked week is ranked on its own totals,
 * Void teams last and unranked, as `LeaderboardPanel` does.
 */
export function CombinedPanel({ score, labels, week, today, href }: {
  score: PairScore; labels: { a: string; b: string };
  /** Null is every week so far. */
  week: number | null; today: string;
  href: (extra: Record<string, string>) => string;
}) {
  const picked = week === null ? null : score.weeks.find((w) => w.week.number === week) ?? null;
  const rows = picked ? rankByTotal(pairWeekStandings(score.standings, picked)) : score.standings;
  // D814: the organisers' ad hoc points get their own column whenever the rows have some.
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
      <p className="text-sm text-muted-foreground">
        {picked ? `${weekLabel(picked.week)}. ` : ""}Track A is {labels.a}, Track B is {labels.b}. Each track&apos;s points are its daily points and its own podium; participation is when every member logged every day on either track, or points the organisers gave for it{adjusted ? `; ad hoc is the points added by the organisers${picked ? " for this week" : ""}` : ""}.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead><TableHead>Team</TableHead>
            <TableHead className="text-right">Track A</TableHead><TableHead className="text-right">Track B</TableHead>
            <TableHead className="text-right">Participation</TableHead>
            {adjusted && <TableHead className="text-right" title="Ad hoc points from the organisers">Ad hoc</TableHead>}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.rank ?? "–"}</TableCell>
              <TableCell className="font-bold">{r.name}</TableCell>
              <TableCell className="text-right tabular-nums">{r.a}</TableCell>
              <TableCell className="text-right tabular-nums">{r.b}</TableCell>
              <TableCell className="text-right tabular-nums">{r.bonus}</TableCell>
              {adjusted && <TableCell className="text-right tabular-nums">{r.adjust > 0 ? `+${r.adjust}` : r.adjust}</TableCell>}
              <TableCell className="text-right font-extrabold tabular-nums">{r.void ? "Void" : r.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
