"use client";
import { useState } from "react";
import { Field } from "@/components/admin/Field";
import { MAX_SQUAD } from "../lib/sports";

const input = "h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** D638: a sport's name and squad size; "Allow subs" reveals the most-players number. */
export function SportFields({ sport }: { sport?: { name: string; min_size: number; max_size: number } }) {
  const [subs, setSubs] = useState(sport ? sport.max_size > sport.min_size : false);
  return (
    <div className="grid grid-cols-1 gap-4">
      <Field label="Name" name="name" defaultValue={sport?.name} placeholder="Badminton" />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sport-size" className="text-sm font-bold">Squad size</label>
          <input id="sport-size" name="size" type="number" min={1} max={MAX_SQUAD} required inputMode="numeric" defaultValue={sport?.min_size ?? 2} className={input} />
        </div>
        {subs && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sport-max" className="text-sm font-bold">Most players, with subs</label>
            <input id="sport-max" name="max" type="number" min={1} max={MAX_SQUAD} required inputMode="numeric" defaultValue={sport?.max_size} className={input} />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="subs" checked={subs} onChange={(e) => setSubs(e.target.checked)} className="size-4" />
        Allow subs
      </label>
    </div>
  );
}
