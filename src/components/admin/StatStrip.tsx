import { Card } from "@/components/ui/Card";

export type Stat = { label: string; value: number; lead?: boolean };

/**
 * A band of counts under the page title. Deliberately flat — no icons, no tinted
 * grounds: as a 2x2 of pastel tiles this restated the check-in hero beside it and
 * left a column of dead space. Only the lead figure takes colour, so the number
 * that matters is the one the eye lands on.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <Card className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-line">
      {stats.map((s) => (
        <div key={s.label} className="px-5 py-4">
          <div className={`text-[30px] font-extrabold leading-none tabular-nums ${s.lead ? "text-ok-strong" : "text-ink"}`}>{s.value}</div>
          <div className="mt-1.5 text-xs font-semibold text-muted">{s.label}</div>
        </div>
      ))}
    </Card>
  );
}
