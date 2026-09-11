import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";

/**
 * The counts as a vertical list, which packs into a narrow column better than a
 * horizontal band. The progress meter lives here too, so the check-in figure is
 * stated once on the page rather than twice in two treatments.
 *
 * `scope` names what is being counted. The number is meaningless without it: 34 of 43
 * reads very differently as "through the door" and as "at dinner".
 */
export function SummaryCard({ checkedIn, registered, scope, picker }: {
  checkedIn: number;
  registered: number;
  scope: string;
  picker?: React.ReactNode;
}) {
  const rows: { label: string; value: number; lead?: boolean }[] = [
    { label: "Checked in", value: checkedIn, lead: true },
    { label: "Not yet in", value: Math.max(0, registered - checkedIn) },
    { label: "Registered", value: registered },
  ];
  const pct = registered > 0 ? Math.round((checkedIn / registered) * 100) : 0;
  return (
    <Card className="p-5">
      <h2 className="text-[17px] font-extrabold">Summary</h2>
      {picker && <div className="mt-3">{picker}</div>}
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{scope}</p>
      <dl className="mt-1">
        {rows.map((r, i) => (
          <div key={r.label} className={`flex items-baseline justify-between py-3 ${i < rows.length - 1 ? "border-b border-line" : ""}`}>
            <dt className="text-[13px] font-bold text-muted">{r.label}</dt>
            <dd className={`text-[26px] font-extrabold leading-none tabular-nums ${r.lead ? "text-ok-strong" : "text-ink"}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        <Meter value={checkedIn} max={registered} label={`${checkedIn} of ${registered} attendees checked in — ${scope}`} />
        <p className="text-xs font-semibold text-muted tabular-nums">{pct}% of the room is in</p>
      </div>
    </Card>
  );
}
