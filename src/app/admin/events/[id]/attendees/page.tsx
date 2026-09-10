import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees, countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAttendeeAction, assignTableAction, clearTableAction } from "../actions";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SearchInput } from "@/components/admin/SearchInput";
import { AttendeeTable, type AttendeeRow } from "@/components/admin/AttendeeTable";
import { Card, buttonClass } from "@/components/ui/Card";
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
      <AttendeeTable
        key={`${page}:${sp.q ?? ""}`}
        eventId={ev.id}
        rows={slice.map((a): AttendeeRow => ({ ...a, checkedInAt: earliestScan.get(a.id) ?? null }))}
        emptyMessage={sp.q ? `No one matches “${sp.q}”.` : "No attendees yet. Import a masterlist or open registration."}
        assignTable={assignTableAction.bind(null, ev.id)}
        clearTable={clearTableAction.bind(null, ev.id)}
      />
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
      <div id="add-attendee" className="scroll-mt-4">
        <Card className="p-4">
          <h2 className="font-bold">Add an attendee by hand</h2>
          <form action={addAttendeeAction.bind(null, ev.id)} className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="Name" name="name" /><Field label="Email" name="email" /><Field label="Phone" name="phone" />
            <Field label="Company" name="company" /><Field label="Category" name="category" /><Field label="Table" name="table_no" />
            <Field label="Seat" name="seat_no" />
            <input type="hidden" name="source" value="import" />
            <div className="md:col-span-3"><SubmitButton>Add</SubmitButton></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
