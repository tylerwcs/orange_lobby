import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees, countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAttendeeAction, assignTableAction, clearTableAction, importMasterlistAction } from "../actions";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SearchInput } from "@/components/admin/SearchInput";
import { Modal } from "@/components/admin/Modal";
import { AttendeeTable, type AttendeeRow } from "@/components/admin/AttendeeTable";
import { buttonClass } from "@/components/ui/Card";
import { paginate } from "@/lib/paginate";

export const metadata = { title: "Attendees · Orange Lobby" };

const PAGE_SIZE = 50;

// A few thousand masterlist rows can outrun the default serverless timeout.
export const maxDuration = 60;

const IMPORT_COLUMNS: [string, string][] = [
  ["Name", "Required. Blank rows are skipped and reported back."],
  ["Email", "Matches existing attendees. Rows with one update; rows without are always added."],
  ["Phone", "Kept as text, so leading zeros survive."],
  ["Company", "Shown to crew on the scan card."],
  ["Category", "Drives which agenda sessions the attendee sees."],
  ["Table", "Shown on My seat."],
  ["Seat", "Optional, shown next to the table."],
];

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
            <Modal title="Add an attendee" hint="For someone who is not on the masterlist and is not registering themselves." trigger="Add attendee" icon="plus">
              <form action={addAttendeeAction.bind(null, ev.id)} className="grid gap-3 md:grid-cols-2">
                <Field label="Name" name="name" /><Field label="Email" name="email" />
                <Field label="Phone" name="phone" /><Field label="Company" name="company" />
                <Field label="Category" name="category" /><Field label="Table" name="table_no" />
                <Field label="Seat" name="seat_no" />
                <input type="hidden" name="source" value="import" />
                <div className="md:col-span-2"><SubmitButton>Add attendee</SubmitButton></div>
              </form>
            </Modal>
            <Modal title="Import masterlist" hint="The first sheet is read. Rows are matched by email, so re-importing the same file updates in place rather than duplicating." trigger="Import masterlist" icon="download">
              <form action={importMasterlistAction.bind(null, ev.id)} className="grid gap-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-bold">Excel file (.xlsx)</span>
                  <input type="file" name="file" accept=".xlsx" required className="block w-full rounded-[var(--radius-control)] border border-dashed border-line bg-canvas p-4 text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white" />
                </label>
                <SubmitButton>Import attendees</SubmitButton>
              </form>
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-sm font-extrabold">Columns it looks for</h3>
                <p className="mt-0.5 text-xs text-muted">Header row, any order, case-insensitive. Anything else is kept under its own header and can appear on the scan card.</p>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                  {IMPORT_COLUMNS.map(([c, note]) => (
                    <div key={c}><dt className="font-mono font-bold">{c}</dt><dd className="text-muted">{note}</dd></div>
                  ))}
                </dl>
              </div>
            </Modal>
          </>
        }
      />
      {sp.imported !== undefined && (
        <p role="status" className="rounded-[var(--radius-control)] bg-ok-soft p-3 text-sm font-semibold text-ok-strong">
          Imported {sp.imported}, updated {sp.updated}. {sp.skipped ? `Skipped: ${sp.skipped}` : ""}
        </p>
      )}
      {sp.error && <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft p-3 text-sm font-semibold text-danger-strong">{sp.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput initial={sp.q ?? ""} />
      </div>
      <AttendeeTable
        key={`${page}:${sp.q ?? ""}`}
        eventId={ev.id}
        rows={slice.map((a): AttendeeRow => ({
          id: a.id,
          name: a.name,
          email: a.email,
          company: a.company,
          category: a.category,
          table_no: a.table_no,
          seat_no: a.seat_no,
          source: a.source,
          checkedInAt: earliestScan.get(a.id) ?? null,
        }))}
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
    </div>
  );
}
