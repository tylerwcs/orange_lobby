"use client";
import { useState } from "react";
import type { Checkpoint } from "@/lib/types";

type TableAction = (formData: FormData) => void | Promise<void>;

const control = "min-h-11 rounded-full bg-white/10 px-3.5 text-xs font-bold text-white";

export function BulkBar({
  eventId,
  ids,
  onClear,
  assignTable,
  clearTable,
  markCheckedIn,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  ids: string[];
  onClear: () => void;
  assignTable: TableAction;
  clearTable: TableAction;
  markCheckedIn: TableAction;
  checkpoints: Checkpoint[];
  defaultCheckpointId?: string;
}) {
  const [table, setTable] = useState("");
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-ink p-3 text-white">
      <span className="text-[13px] font-extrabold">{ids.length} selected</span>

      {/* Checking a group in by hand: the desk that registers six people off one clipboard,
          or a door where the scanner could not reach the network. */}
      {checkpoints.length > 0 && (
        <form action={markCheckedIn} className="flex items-center gap-2">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <label htmlFor="bulk-checkpoint" className="sr-only">Checkpoint to check them in at</label>
          <select id="bulk-checkpoint" name="checkpoint_id" defaultValue={defaultCheckpointId}
            className="min-h-11 rounded-full bg-white/10 px-3 text-xs font-bold text-white">
            {checkpoints.map((c) => <option key={c.id} value={c.id} className="text-ink">{c.name}</option>)}
          </select>
          <button className={control}>Mark checked in</button>
        </form>
      )}

      <form action={assignTable} className="flex items-center gap-2">
        <input type="hidden" name="ids" value={ids.join(",")} />
        <label htmlFor="bulk-table" className="sr-only">Table number</label>
        <input id="bulk-table" name="table_no" value={table} onChange={(e) => setTable(e.target.value)}
          placeholder="Table" className="min-h-11 w-24 rounded-full bg-white/10 px-3 text-sm font-bold text-white placeholder:text-white/60" />
        <button className={control}>Assign table</button>
      </form>

      <form action={clearTable}>
        <input type="hidden" name="ids" value={ids.join(",")} />
        <button className={control}>Clear table</button>
      </form>

      <a href={`/admin/events/${eventId}/export/attendance.xlsx?ids=${ids.join(",")}`} download
        className={`${control} content-center`}>Export selected</a>

      <button onClick={onClear} className="ml-auto min-h-11 text-xs font-bold opacity-80">Clear</button>
    </div>
  );
}
