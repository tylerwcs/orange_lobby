import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees, countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAttendeeAction } from "../actions";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SearchInput } from "@/components/admin/SearchInput";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Card";
import { isoToLocalInput } from "@/lib/time";
import { paginate } from "@/lib/paginate";

export const metadata = { title: "Attendees · Orange Lobby" };

const PAGE_SIZE = 50;

export default async function Attendees({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [rows, total, checkins] = await Promise.all([listAttendees(ev.id, sp.q), countAttendees(ev.id), listCheckinsForEvent(ev.id)]);

  // Hoisted single pass over `checkins` (same shape as `checkinStatus`, but scanned once
  // rather than once per row): a per-attendee earliest scan, so status/time lookup below is O(1).
  const earliestScan = new Map<string, string>();
  for (const c of checkins) {
    const prev = earliestScan.get(c.attendee_id);
    if (prev === undefined || c.scanned_at < prev) earliestScan.set(c.attendee_id, c.scanned_at);
  }
  const checkedInCount = earliestScan.size;

  const { slice, page, pages } = paginate(rows, Number(sp.page ?? 1), PAGE_SIZE);
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    qs.set("page", String(p));
    return `/admin/events/${ev.id}/attendees?${qs.toString()}`;
  };
  const from = slice.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + slice.length;

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Attendees"
        subtitle={`${total} registered · ${checkedInCount} checked in`}
        actions={
          <>
            <a href="#add-attendee" className={buttonClass("secondary")}><Icon name="plus" size={18} />Add attendee</a>
            <Link href={`/admin/events/${ev.id}/attendees/import`} className={buttonClass("secondary")}><Icon name="download" size={18} />Import masterlist</Link>
          </>
        }
      />
      {sp.imported !== undefined && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-800">
          Imported {sp.imported}, updated {sp.updated}. {sp.skipped ? `Skipped: ${sp.skipped}` : ""}
        </p>
      )}
      {sp.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput initial={sp.q ?? ""} />
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[720px] text-sm">
        <thead><tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Company</th><th className="p-2">Category</th><th className="p-2">Table</th><th className="p-2">Checked in</th><th className="p-2">Source</th></tr></thead>
        <tbody>
          {slice.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="p-2"><Link className="text-brand-ink" href={`/admin/events/${ev.id}/attendees/${a.id}`}>{a.name}</Link></td>
              <td className="p-2">{a.email}</td><td className="p-2">{a.company}</td><td className="p-2">{a.category}</td>
              <td className="p-2">{a.table_no}{a.seat_no ? ` / ${a.seat_no}` : ""}</td>
              <td className="p-2">
                {(() => {
                  const at = earliestScan.get(a.id);
                  return at
                    ? <Badge tone="ok" dot>In {isoToLocalInput(at).split("T")[1]}</Badge>
                    : <Badge tone="warn" dot>Expected</Badge>;
                })()}
              </td>
              <td className="p-2 text-muted">{a.source}</td>
            </tr>
          ))}
          {slice.length === 0 && <tr className="border-t border-line"><td colSpan={7} className="p-6 text-center text-muted">{sp.q ? `No one matches “${sp.q}”.` : "No attendees yet. Import a masterlist or open registration."}</td></tr>}
        </tbody>
      </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span className="tabular-nums">Showing {from}–{to} of {rows.length}</span>
        <div className="flex items-center gap-2">
          {page > 1
            ? <Link href={pageHref(page - 1)} className={buttonClass("secondary")}>Previous</Link>
            : <span className={`${buttonClass("secondary")} opacity-50`} aria-disabled="true">Previous</span>}
          <span className="tabular-nums">Page {page} of {pages}</span>
          {page < pages
            ? <Link href={pageHref(page + 1)} className={buttonClass("secondary")}>Next</Link>
            : <span className={`${buttonClass("secondary")} opacity-50`} aria-disabled="true">Next</span>}
        </div>
      </div>
      <details id="add-attendee" className="scroll-mt-4 rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
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
