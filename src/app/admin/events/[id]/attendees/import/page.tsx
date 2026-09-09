import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card } from "@/components/ui/Card";
import { importMasterlistAction } from "../../actions";

export const metadata = { title: "Import masterlist · Orange Lobby" };

// A few thousand masterlist rows can outrun the default serverless timeout.
export const maxDuration = 60;

const COLUMNS: [string, string][] = [
  ["Name", "Required. Blank rows are skipped and reported."],
  ["Email", "Used to match existing attendees. Rows with an email update; rows without are always added."],
  ["Phone", "Kept as text, so leading zeros survive."],
  ["Company", "Shown to crew on the scan card and to the attendee."],
  ["Category", "Drives which agenda sessions the attendee sees."],
  ["Table", "Shown on My seat."],
  ["Seat", "Optional, shown next to the table."],
];

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Import masterlist</h1>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form action={importMasterlistAction.bind(null, ev.id)} className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <p className="text-sm text-muted">Upload the client&rsquo;s Excel file. The first sheet is read; its header row must match the template on the right.</p>
          {error && <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="block text-sm">
            <span className="mb-1 block font-bold">Excel file (.xlsx)</span>
            <input type="file" name="file" accept=".xlsx" required className="block w-full rounded-[var(--radius-control)] border border-dashed border-line bg-canvas p-4 text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white" />
          </label>
          <SubmitButton>Import attendees</SubmitButton>
          <p className="text-xs text-muted">Re-importing the same file is safe: rows are matched by email and updated in place.</p>
        </form>

        <Card className="p-6">
          <h2 className="text-base font-extrabold">Template</h2>
          <p className="mt-0.5 mb-3 text-xs text-muted">Header row, in any order, case-insensitive. Extra columns are kept as attendee attributes and can appear on the scan card.</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted"><th className="py-1.5 pr-3">Column</th><th className="py-1.5">Notes</th></tr></thead>
            <tbody>
              {COLUMNS.map(([c, note]) => (
                <tr key={c} className="border-t border-line align-top"><td className="py-2 pr-3 font-mono text-xs font-bold">{c}</td><td className="py-2 text-muted">{note}</td></tr>
              ))}
              <tr className="border-t border-line align-top"><td className="py-2 pr-3 font-mono text-xs font-bold">Anything else</td><td className="py-2 text-muted">Stored under its header, for example Dietary or Shirt size.</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
