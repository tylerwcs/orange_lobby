import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ScanRow } from "@/lib/checkins-stats";
import { isoToLocalInput } from "@/lib/time";
import { elapsed } from "@/lib/text";

const hhmm = (iso: string) => isoToLocalInput(iso).split("T")[1] ?? "";

export function RecentScans({ rows, checkpointNames }: { rows: ScanRow[]; checkpointNames: Map<string, string> }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-[17px] font-extrabold">Recent scans</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No scans yet. They appear here as the crew works the door.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="pb-2.5">Attendee</th><th className="pb-2.5">Company</th><th className="pb-2.5">Table</th>
                <th className="pb-2.5">Checkpoint</th><th className="pb-2.5">Time</th><th className="pb-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.checkinId} className="border-t border-line">
                  <td className="py-3 text-[13px] font-semibold">{r.name}</td>
                  <td className="py-3 text-[13px] font-semibold text-muted">{r.company ?? "—"}</td>
                  <td className="py-3">{r.tableNo ? <Badge tone="brand">{r.tableNo}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="py-3 text-[13px] font-semibold text-muted">{checkpointNames.get(r.checkpointId) ?? "—"}</td>
                  {/* Absolute time answers "when"; the elapsed line is what says the door is still moving. */}
                  <td className="py-3 text-[13px]">
                    <div className="font-semibold text-ink tabular-nums">{hhmm(r.at)}</div>
                    <div className="text-[11px] font-semibold text-muted">{elapsed(r.at)}</div>
                  </td>
                  <td className="py-3">
                    {r.duplicate
                      ? <Badge tone="warn" dot>Already in</Badge>
                      : <Badge tone="ok" dot>Checked in</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
