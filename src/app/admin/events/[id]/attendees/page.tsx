import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees, countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAttendeeAction } from "../actions";

export default async function Attendees({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [rows, total] = await Promise.all([listAttendees(ev.id, sp.q), countAttendees(ev.id)]);
  return (
    <div className="space-y-6">
      {sp.imported !== undefined && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-800">
          Imported {sp.imported}, updated {sp.updated}. {sp.skipped ? `Skipped: ${sp.skipped}` : ""}
        </p>
      )}
      {sp.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Search name, email, company" className="rounded border p-2 text-sm" /><button className="rounded border px-3 text-sm">Search</button></form>
        <span className="text-sm text-gray-600">{total} attendees</span>
        <Link href={`/admin/events/${ev.id}/attendees/import`} className="ml-auto rounded bg-orange-600 px-3 py-2 text-sm text-white">Import masterlist</Link>
      </div>
      <table className="w-full rounded-[var(--radius-card)] border border-line bg-surface text-sm">
        <thead><tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Company</th><th className="p-2">Category</th><th className="p-2">Table</th><th className="p-2">Source</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="p-2"><Link className="text-orange-700" href={`/admin/events/${ev.id}/attendees/${a.id}`}>{a.name}</Link></td>
              <td className="p-2">{a.email}</td><td className="p-2">{a.company}</td><td className="p-2">{a.category}</td>
              <td className="p-2">{a.table_no}{a.seat_no ? ` / ${a.seat_no}` : ""}</td><td className="p-2 text-gray-500">{a.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <summary className="cursor-pointer font-medium">Add attendee</summary>
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
