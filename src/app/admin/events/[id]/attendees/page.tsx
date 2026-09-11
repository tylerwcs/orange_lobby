import Link from "next/link";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees, countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { addAttendeeAction, addAttendeeFieldAction, deleteAttendeeFieldAction, importMasterlistAction, markCheckedInAction, renameAttendeeFieldAction, setColumnAction } from "../actions";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { pickCheckpoint } from "@/lib/checkpoints";
import { nowInKL } from "@/lib/time";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SearchInput } from "@/components/admin/SearchInput";
import { Modal } from "@/components/admin/Modal";
import { AttendeeTable, type AttendeeRow } from "@/components/admin/AttendeeTable";
import { AddColumnForm } from "@/components/admin/AddColumnForm";
import { FieldInputs } from "@/components/admin/FieldInputs";
import { allColumns, bulkFields, columnsCookieName, parseTablePrefs, tableCookieName } from "@/lib/columns";
import { eventFields, fieldsFromQuestions, unclaimedKeys } from "@/lib/attendee-fields";
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
  ["Table", "Shown to the attendee and on the crew scan card."],
  ["Anything else", "Kept under its own header. Add a column of the same name to edit it in the app."],
];

export default async function Attendees({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [rows, total, checkins, cps, jar] = await Promise.all([listAttendees(ev.id, sp.q), countAttendees(ev.id), listCheckinsForEvent(ev.id), listCheckpoints(ev.id), cookies()]);

  // Which columns this browser has hidden. Read on the server so the first paint is
  // already right, rather than rendering everything and pulling columns back out.
  // Registration questions are columns without anyone declaring them — the answers are
  // already on file. `attendee_fields` is only what was added on top.
  const registrationFields = fieldsFromQuestions(ev.registration_questions);
  const allFields = eventFields(ev.registration_questions, ev.attendee_fields);
  const columns = allColumns(registrationFields, ev.attendee_fields);
  // The older cookie only held hidden columns; reading it as a fallback means an organiser
  // who had already tuned their table does not lose that when ordering ships.
  const prefs = parseTablePrefs(jar.get(tableCookieName(ev.id))?.value, columns, jar.get(columnsCookieName(ev.id))?.value);

  // What the "add a column" dialog offers. Counted across the whole roster, not the
  // current search — a suggestion that changes as you type would be a lie.
  const everyone = sp.q ? await listAttendees(ev.id) : rows;
  const suggestions = unclaimedKeys(everyone.map((a) => a.extra ?? {}), allFields);

  // Hoisted single pass over `checkins` (same shape as `checkinStatus`, but scanned once
  // rather than once per row): a per-attendee earliest scan, so status/time lookup below is O(1).
  const earliestScan = new Map<string, string>();
  for (const c of checkins) {
    const prev = earliestScan.get(c.attendee_id);
    if (prev === undefined || c.scanned_at < prev) earliestScan.set(c.attendee_id, c.scanned_at);
  }
  const checkedInCount = earliestScan.size;

  // Default the bulk check-in to a checkpoint on today, so the desk is not one wrong
  // dropdown away from writing arrivals into yesterday's door.
  const defaultCheckpointId = (pickCheckpoint(cps, nowInKL().date, undefined) ?? cps[0])?.id;

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
                <FieldInputs fields={allFields} />
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
      <SearchInput initial={sp.q ?? ""} matches={rows.length} total={total} />
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
          source: a.source,
          checkedInAt: earliestScan.get(a.id) ?? null,
          // Only the defined columns cross to the client: an unmapped header an import
          // left in `extra` has no column to land in and stays on the server.
          values: Object.fromEntries(allFields.map((f) => [f.key, a.extra?.[f.key] ?? ""])),
        }))}
        columns={columns}
        initialPrefs={prefs}
        renameColumn={renameAttendeeFieldAction.bind(null, ev.id)}
        deleteColumn={deleteAttendeeFieldAction.bind(null, ev.id)}
        addColumnForm={<AddColumnForm addColumn={addAttendeeFieldAction.bind(null, ev.id)} suggestions={suggestions} />}
        emptyMessage={sp.q ? `No one matches “${sp.q}”.` : "No attendees yet. Import a masterlist or open registration."}
        setColumn={setColumnAction.bind(null, ev.id)}
        markCheckedIn={markCheckedInAction.bind(null, ev.id)}
        bulkEditable={bulkFields(allFields)}
        checkpoints={cps}
        defaultCheckpointId={defaultCheckpointId}
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
