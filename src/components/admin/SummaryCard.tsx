import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";

/**
 * The counts as a vertical list, which packs into a narrow column better than a horizontal
 * band. The progress meter lives here too, so the check-in figure is stated once on the
 * page rather than twice in two treatments.
 *
 * The checkpoint is not named here. The picker in the page header sits directly above this
 * card and says it once; repeating it was the duplication this card already lost once. It
 * still reaches the meter's label, which is where a screen reader needs it.
 */
export function SummaryCard({ checkedIn, registered, scope }: {
  checkedIn: number;
  registered: number;
  /** The running checkpoint, or null when the event has none yet. */
  scope: string | null;
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
      <dl className="mt-1">
        {rows.map((r, i) => (
          <div key={r.label} className={`flex items-baseline justify-between py-3 ${i < rows.length - 1 ? "border-b border-line" : ""}`}>
            <dt className="text-[13px] font-bold text-muted">{r.label}</dt>
            <dd className={`text-[26px] font-extrabold leading-none tabular-nums ${r.lead ? "text-ok-strong" : "text-ink"}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        <Meter value={checkedIn} max={registered} label={`${checkedIn} of ${registered} attendees checked in${scope ? ` at ${scope}` : ""}`} />
        <p className="text-xs font-semibold text-muted tabular-nums">{pct}% of the room is in</p>
      </div>
    </Card>
  );
}
