"use client";
import { useState } from "react";

type TableAction = (formData: FormData) => void | Promise<void>;

export function BulkBar({
  eventId,
  ids,
  onClear,
  assignTable,
  clearTable,
}: {
  eventId: string;
  ids: string[];
  onClear: () => void;
  assignTable: TableAction;
  clearTable: TableAction;
}) {
  const [table, setTable] = useState("");
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-ink p-3 text-white">
      <span className="text-[13px] font-extrabold">{ids.length} selected</span>
      <form action={assignTable} className="flex items-center gap-2">
        <input type="hidden" name="ids" value={ids.join(",")} />
        <label htmlFor="bulk-table" className="sr-only">Table number</label>
        <input id="bulk-table" name="table_no" value={table} onChange={(e) => setTable(e.target.value)}
          placeholder="Table" className="min-h-11 w-24 rounded-full bg-white/10 px-3 text-sm font-bold text-white placeholder:text-white/60" />
        <button className="min-h-11 rounded-full bg-white/10 px-3.5 text-xs font-bold">Assign table</button>
      </form>
      <form action={clearTable}>
        <input type="hidden" name="ids" value={ids.join(",")} />
        <button className="min-h-11 rounded-full bg-white/10 px-3.5 text-xs font-bold">Clear table</button>
      </form>
      <a href={`/admin/events/${eventId}/export/attendance.xlsx?ids=${ids.join(",")}`} download
        className="min-h-11 content-center rounded-full bg-white/10 px-3.5 text-xs font-bold text-white">Export selected</a>
      <button onClick={onClear} className="ml-auto min-h-11 text-xs font-bold opacity-80">Clear</button>
    </div>
  );
}
