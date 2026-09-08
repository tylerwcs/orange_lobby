import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { importMasterlistAction } from "../../actions";

// A few thousand masterlist rows can outrun the default serverless timeout.
export const maxDuration = 60;

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <form action={importMasterlistAction.bind(null, ev.id)} className="max-w-lg space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <h2 className="font-medium">Import masterlist (.xlsx)</h2>
      <p className="text-sm text-muted">Header row: <code>Name | Email | Phone | Company | Category | Table | Seat</code>, plus any extra columns. Rows with an email update existing attendees; rows without email are always added.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <input type="file" name="file" accept=".xlsx" required className="text-sm" />
      <SubmitButton>Import</SubmitButton>
    </form>
  );
}
