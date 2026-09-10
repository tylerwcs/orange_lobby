import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import type { ScanRow } from "@/lib/checkins-stats";
import { isoToLocalInput } from "@/lib/time";

const hhmm = (iso: string) => isoToLocalInput(iso).split("T")[1] ?? "";

/** Bound by the page so this component never imports from a bracketed route path. */
type RemoveCheckin = (eventId: string, checkpointId: string, attendeeId: string) => Promise<void>;

export function RecentScans({ rows, checkpointNames, eventId, removeCheckin }: {
  rows: ScanRow[]; checkpointNames: Map<string, string>; eventId: string; removeCheckin: RemoveCheckin;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-[17px] font-extrabold">Recent scans</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No scans yet. They appear here as the crew works the door.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="pb-2.5">Attendee</th><th className="pb-2.5">Company</th><th className="pb-2.5">Table</th>
                <th className="pb-2.5">Checkpoint</th><th className="pb-2.5">Time</th><th className="pb-2.5">Status</th>
                <th className="pb-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.checkinId} className="border-t border-line">
                  <td className="py-3 text-[13px] font-semibold">{r.name}</td>
                  <td className="py-3 text-[13px] text-muted">{r.company ?? "—"}</td>
                  <td className="py-3">{r.tableNo ? <Badge tone="brand">{r.tableNo}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="py-3 text-[13px] text-muted">{checkpointNames.get(r.checkpointId) ?? "—"}</td>
                  <td className="py-3 text-[13px] font-semibold text-muted tabular-nums">{hhmm(r.at)}</td>
                  <td className="py-3">
                    {r.duplicate
                      ? <Badge tone="warn" dot>Already in</Badge>
                      : <Badge tone="ok" dot>Checked in</Badge>}
                  </td>
                  {/* The scanner's Undo expires in six seconds; this is the only way back after that. */}
                  <td className="py-3 text-right">
                    <form action={removeCheckin.bind(null, eventId, r.checkpointId, r.attendeeId)}>
                      <ConfirmButton message={`Remove the check-in for ${r.name} at ${checkpointNames.get(r.checkpointId) ?? "this checkpoint"}? They will need to be scanned again.`} className="text-red-700">Remove</ConfirmButton>
                    </form>
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
