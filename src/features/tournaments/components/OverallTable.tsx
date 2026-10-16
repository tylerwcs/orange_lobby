import { ordinal, type OverallRow } from "../lib/results";
import type { TournamentSport } from "../lib/squads";

/**
 * D662: the week's table - rank, group, each sport's points (short names, full in the title),
 * and the total. "–" is a sport not placed yet, "0 F" a forfeit. Shared by the admin Leaderboard
 * tab and the portal's Overall view; `highlight` is the viewer's group.
 */
export function OverallTable({ rows, sports, names, highlight = null }: {
  rows: OverallRow[];
  sports: TournamentSport[];
  names: Map<string, string>;
  highlight?: string | null;
}) {
  const ordered = [...sports].sort((a, b) => a.position - b.position);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Group</th>
            {ordered.map((s) => (
              <th key={s.id} className="px-1.5 py-2 text-right font-medium" title={s.name}>
                <span aria-hidden>{s.name.slice(0, 3)}</span><span className="sr-only">{s.name}</span>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.groupId} className={`border-b last:border-0 ${r.groupId === highlight ? "bg-primary/10 font-bold" : ""}`}>
              <td className="px-3 py-2">{r.rank}{r.tied ? "=" : ""}</td>
              <td className="py-2">{names.get(r.groupId) ?? "A group"}</td>
              {r.bySport.map((v, i) => (
                <td key={ordered[i]?.id ?? i} className="px-1.5 py-2 text-right">
                  {v === null ? <span className="text-muted-foreground">–</span> : v === "F" ? <span className="text-warning">0 F</span> : v}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-extrabold">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Points: 1st 40 · 2nd 35 · … · 12th 20". */
export function pointsLine(table: number[]): string {
  return `Points: ${table.map((p, i) => `${ordinal(i + 1)} ${p}`).join(" · ")}`;
}
