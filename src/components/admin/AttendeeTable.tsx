"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { isoToLocalInput } from "@/lib/time";
import { BulkBar } from "@/components/admin/BulkBar";
import type { AttendeeSource, Checkpoint } from "@/lib/types";

// Exactly the fields this table renders — never the full `Attendee` shape, which
// carries `token` (the bearer credential for the attendee portal link), `phone`
// and the free-form `extra` map. Those must never reach this client component.
export type AttendeeRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  category: string | null;
  table_no: string | null;
  source: AttendeeSource;
  checkedInAt: string | null;
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

export function AttendeeTable({
  eventId,
  rows,
  emptyMessage,
  assignTable,
  clearTable,
  markCheckedIn,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  rows: AttendeeRow[];
  emptyMessage: string;
  assignTable: TableAction;
  clearTable: TableAction;
  markCheckedIn: TableAction;
  checkpoints: Checkpoint[];
  defaultCheckpointId?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Bumped after every successful bulk submit so BulkBar remounts fresh — clearing
  // both the selection (below) and its own `table` input, which would otherwise
  // survive since BulkBar merely renders null while `selected` is empty.
  const [bulkVersion, setBulkVersion] = useState(0);

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
        assignTable={runBulk(assignTable)}
        clearTable={runBulk(clearTable)}
        markCheckedIn={runBulk(markCheckedIn)}
        checkpoints={checkpoints}
        defaultCheckpointId={defaultCheckpointId}
      />
      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              <th className="p-2">
                <HeaderCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
              </th>
              <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Company</th><th className="p-2">Category</th><th className="p-2">Table</th><th className="p-2">Checked in</th><th className="p-2">Source</th>
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
                <td className="p-2"><Link className="text-brand-ink" href={`/admin/events/${eventId}/attendees/${a.id}`}>{a.name}</Link></td>
                <td className="p-2">{a.email}</td><td className="p-2">{a.company}</td><td className="p-2">{a.category}</td>
                <td className="p-2">{a.table_no}</td>
                <td className="p-2">
                  {a.checkedInAt
                    ? <Badge tone="ok" dot>In {isoToLocalInput(a.checkedInAt).split("T")[1]}</Badge>
                    : <Badge tone="warn" dot>Expected</Badge>}
                </td>
                <td className="p-2 text-muted">{a.source}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr className="border-t border-line"><td colSpan={8} className="p-6 text-center text-muted">{emptyMessage}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
