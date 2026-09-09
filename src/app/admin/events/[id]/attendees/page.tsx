import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees, countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAttendeeAction } from "../actions";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Attendees · Orange Lobby" };

export default async function Attendees({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [rows, total, checkpoints, checkins] = await Promise.all([listAttendees(ev.id, sp.q), countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id)]);
  const cpName = new Map(checkpoints.map((c) => [c.id, c.name]));
  const inAt = new Map<string, string[]>();
  for (const c of checkins) inAt.set(c.attendee_id, [...(inAt.get(c.attendee_id) ?? []), cpName.get(c.checkpoint_id) ?? "?"]);
  return (
    <div className="space-y-6">
      <h1 className="mb-4 text-2xl font-extrabold">Attendees</h1>
      {sp.imported !== undefined && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-800">
          Imported {sp.imported}, updated {sp.updated}. {sp.skipped ? `Skipped: ${sp.skipped}` : ""}
        </p>
      )}
      {sp.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <form className="relative flex-1 min-w-56" role="search">
          <label htmlFor="attendee-search" className="sr-only">Search attendees</label>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="attendee-search" name="q" defaultValue={sp.q} placeholder="Search name, email or company, then press Enter" className="w-full min-h-10 rounded-[var(--radius-control)] border border-line bg-surface pl-9 pr-3 text-sm" />
        </form>
        <span className="text-sm text-muted">{total} attendees</span>
        <Link href={`/admin/events/${ev.id}/attendees/import`} className="ml-auto inline-flex min-h-10 items-center rounded-[var(--radius-control)] bg-brand px-3 text-sm font-bold text-ink">Import masterlist</Link>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead><tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Company</th><th className="p-2">Category</th><th className="p-2">Table</th><th className="p-2">Checked in</th><th className="p-2">Source</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="p-2"><Link className="text-brand-ink" href={`/admin/events/${ev.id}/attendees/${a.id}`}>{a.name}</Link></td>
              <td className="p-2">{a.email}</td><td className="p-2">{a.company}</td><td className="p-2">{a.category}</td>
              <td className="p-2">{a.table_no}{a.seat_no ? ` / ${a.seat_no}` : ""}</td>
              <td className="p-2">{(inAt.get(a.id) ?? []).length === 0 ? <span className="text-muted">—</span> : (inAt.get(a.id) ?? []).map((n) => <span key={n} className="mr-1 inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-800">{n}</span>)}</td>
              <td className="p-2 text-muted">{a.source}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr className="border-t border-line"><td colSpan={7} className="p-6 text-center text-muted">{sp.q ? `No one matches “${sp.q}”.` : "No attendees yet. Import a masterlist or open registration."}</td></tr>}
        </tbody>
      </table>
      </div>
      <details className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <summary className="cursor-pointer font-bold">Add an attendee by hand</summary>
        <form action={addAttendeeAction.bind(null, ev.id)} className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Name" name="name" /><Field label="Email" name="email" /><Field label="Phone" name="phone" />
          <Field label="Company" name="company" /><Field label="Category" name="category" /><Field label="Table" name="table_no" />
          <Field label="Seat" name="seat_no" />
          <input type="hidden" name="source" value="import" />
          <div className="md:col-span-3"><SubmitButton>Add</SubmitButton></div>
        </form>
      </details>
    </div>
  );
}
