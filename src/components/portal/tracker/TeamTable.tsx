import type { Standing } from "@/lib/challenge-score";

/** D379: every team's rank and points - never km, so the weekly podium stays a surprise. */
export function TeamTable({ standings, mine }: { standings: Standing[]; mine: string | null }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-extrabold">Team table</h2>
      <ol className="flex flex-col overflow-hidden rounded-xl border border-border">
        {standings.map((s) => (
          <li key={s.id} className={`flex min-h-11 items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${s.id === mine ? "bg-primary/5 font-extrabold" : ""}`}>
            <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{s.rank ?? "–"}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{s.name}{s.id === mine ? " (your team)" : ""}</span>
            <span className="text-sm font-bold tabular-nums">{s.void ? "Void" : `${s.total} pts`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
