"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { isoToLocalInput } from "@/lib/time";
import { BulkBar } from "@/components/admin/BulkBar";
import { ColumnMenu } from "@/components/admin/ColumnMenu";
import { Icon } from "@/components/ui/Icon";
import { columnsCookieName, hiddenToCookie, type ColumnDef } from "@/lib/columns";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { AttendeeSource, Checkpoint } from "@/lib/types";

// Exactly the fields this table renders — never the full `Attendee` shape, which carries
// `token` (the bearer credential for the attendee portal link) and `phone`. `values` holds
// only the event's *defined* columns, so an unmapped key an import left behind in `extra`
// stays on the server.
export type AttendeeRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  category: string | null;
  table_no: string | null;
  source: AttendeeSource;
  checkedInAt: string | null;
  values: Record<string, string>;
};

type TableAction = (formData: FormData) => void | Promise<void>;

function HeaderCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
      <span className="sr-only">Select all attendees on this page</span>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function cell(a: AttendeeRow, key: string) {
  switch (key) {
    case "email": return a.email;
    case "company": return a.company;
    case "category": return a.category;
    case "table_no": return a.table_no;
    case "source": return <span className="text-muted">{a.source}</span>;
    case "checked_in":
      return a.checkedInAt
        ? <Badge tone="ok" dot>In {isoToLocalInput(a.checkedInAt).split("T")[1]}</Badge>
        : <Badge tone="warn" dot>Expected</Badge>;
    default: return a.values[key] || <span className="text-muted">—</span>;
  }
}

export function AttendeeTable({
  eventId,
  rows,
  columns,
  initialHidden,
  emptyMessage,
  setColumn,
  markCheckedIn,
  bulkEditable,
  renameColumn,
  deleteColumn,
  addColumnForm,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  rows: AttendeeRow[];
  columns: ColumnDef[];
  initialHidden: string[];
  emptyMessage: string;
  setColumn: TableAction;
  markCheckedIn: TableAction;
  bulkEditable: AttendeeField[];
  renameColumn: TableAction;
  deleteColumn: TableAction;
  addColumnForm: React.ReactNode;
  checkpoints: Checkpoint[];
  defaultCheckpointId?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Bumped after every successful bulk submit so BulkBar remounts fresh — clearing
  // both the selection (below) and its own `table` input, which would otherwise
  // survive since BulkBar merely renders null while `selected` is empty.
  const [bulkVersion, setBulkVersion] = useState(0);
  // Seeded from the cookie on the server, so the first paint already has the right
  // columns and nothing flashes in and back out on hydration.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  const addRef = useRef<HTMLDialogElement>(null);

  // Adding a column redirects back to this same URL, so nothing unmounts the dialog and
  // nothing changes in the address bar. The new column arriving is the signal that the
  // task finished.
  const columnCount = columns.length;
  const lastCount = useRef(columnCount);
  useEffect(() => {
    if (lastCount.current === columnCount) return;
    lastCount.current = columnCount;
    addRef.current?.close();
  }, [columnCount]);

  const toggleColumn = (key: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key); else next.add(key);
      // A per-browser preference, not shared state: one organiser hiding Source must not
      // hide it for the crew member next to them.
      document.cookie = `${columnsCookieName(eventId)}=${hiddenToCookie(next)}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  };

  const shown = columns.filter((c) => !hidden.has(c.key));
  const hiddenCount = columns.length - shown.length;

  const runBulk = (action: TableAction): TableAction => async (formData) => {
    await action(formData);
    setSelected(new Set());
    setBulkVersion((v) => v + 1);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((a) => a.id)) : new Set());
  };

  const selectedOnPage = rows.filter((a) => selected.has(a.id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  return (
    <div className="space-y-3">
      <BulkBar
        key={bulkVersion}
        eventId={eventId}
        ids={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        setColumn={runBulk(setColumn)}
        markCheckedIn={runBulk(markCheckedIn)}
        fields={bulkEditable}
        checkpoints={checkpoints}
        defaultCheckpointId={defaultCheckpointId}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {hiddenCount > 0
            ? `${hiddenCount} ${hiddenCount === 1 ? "column is" : "columns are"} hidden. Any column header opens the list.`
            : "Registration questions are already columns. Any header opens the list; add one for what the form never asked."}
        </p>
        <button type="button" onClick={() => addRef.current?.showModal()}
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-bold text-ink transition-colors duration-150 hover:bg-canvas">
          <Icon name="plus" size={18} />Add a column
        </button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">
                <HeaderCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
              </th>
              <th className="p-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Name</th>
              {shown.map((c) => (
                <th key={c.key} className="px-0.5 py-2">
                  <ColumnMenu
                    column={c} columns={columns} hidden={hidden}
                    onToggle={toggleColumn}
                    onAddColumn={() => addRef.current?.showModal()}
                    renameColumn={renameColumn}
                    deleteColumn={deleteColumn}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="p-0">
                  <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                    <span className="sr-only">Select {a.name}</span>
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={(e) => toggleOne(a.id, e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                </td>
                <td className="p-2"><Link className="font-semibold text-brand-ink" href={`/admin/events/${eventId}/attendees/${a.id}`}>{a.name}</Link></td>
                {shown.map((c) => <td key={c.key} className="p-2">{cell(a, c.key)}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr className="border-t border-line"><td colSpan={shown.length + 2} className="p-6 text-center text-muted">{emptyMessage}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* `m-auto` is load-bearing — see Modal.tsx: Tailwind's preflight zeroes the margin
          a dialog centres itself with. */}
      <dialog
        ref={addRef} aria-label="Add a column"
        onClick={(e) => { if (e.target === addRef.current) addRef.current?.close(); }}
        className="m-auto w-[min(92vw,520px)] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-[var(--shadow-card)] backdrop:bg-ink/40"
      >
        <div className="flex items-start gap-4 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold">Add a column</h2>
            <p className="mt-1 text-sm text-muted">For what the registration form never asked — a room number, a flight. Every form question is already a column. Whatever you add here appears on every attendee, in their details, and in the attendance export.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => addRef.current?.close()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors duration-150 hover:bg-canvas">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="p-5">{addColumnForm}</div>
      </dialog>
    </div>
  );
}
