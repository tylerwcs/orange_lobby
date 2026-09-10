"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { isoToLocalInput } from "@/lib/time";
import { BulkBar } from "@/components/admin/BulkBar";
import type { Attendee } from "@/lib/types";

export type AttendeeRow = Attendee & { checkedInAt: string | null };

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
}: {
  eventId: string;
  rows: AttendeeRow[];
  emptyMessage: string;
  assignTable: TableAction;
  clearTable: TableAction;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        eventId={eventId}
        ids={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        assignTable={assignTable}
        clearTable={clearTable}
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
                <td className="p-2">{a.table_no}{a.seat_no ? ` / ${a.seat_no}` : ""}</td>
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
