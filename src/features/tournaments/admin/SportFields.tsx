"use client";
import { useState } from "react";
import { Field } from "@/components/admin/Field";
import { MAX_SQUAD } from "../lib/sports";
import { MAX_POOL, MIN_POOL } from "../lib/results";
import type { TournamentSport } from "../lib/squads";

const input = "h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const select = "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

type SportValues = Pick<TournamentSport, "name" | "min_size" | "max_size"> & Partial<Pick<TournamentSport, "result_kind" | "format" | "pool_size">>;

/**
 * D638, D653: a sport's name, squad size ("Allow subs" reveals the most-players number), how its
 * results are kept and its format. Once the sport has matches (`locked`), the results settings
 * are shown but fixed, and posted as they are so the save leaves them alone.
 */
export function SportFields({ sport, locked = false }: { sport?: SportValues; locked?: boolean }) {
  const [subs, setSubs] = useState(sport ? sport.max_size > sport.min_size : false);
  const [format, setFormat] = useState(sport?.format ?? "pools");
  const kind = sport?.result_kind ?? "score";
  const poolSize = sport?.pool_size ?? 3;
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
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sport-results" className="text-sm font-bold">Results</label>
          <select id="sport-results" name={locked ? undefined : "result_kind"} defaultValue={kind} disabled={locked} className={select}>
            <option value="score">Score — higher wins</option>
            <option value="time">Time — faster wins</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sport-format" className="text-sm font-bold">Format</label>
          <select id="sport-format" name={locked ? undefined : "format"} value={format} onChange={(e) => setFormat(e.target.value as "pools" | "manual")} disabled={locked} className={select}>
            <option value="pools">Pools, then placing brackets</option>
            <option value="manual">Matches I add by hand</option>
          </select>
        </div>
        {format === "pools" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sport-pool" className="text-sm font-bold">Pool size</label>
            <input id="sport-pool" name={locked ? undefined : "pool_size"} type="number" min={MIN_POOL} max={MAX_POOL} required inputMode="numeric" defaultValue={poolSize} disabled={locked} className={input} />
          </div>
        )}
      </div>
      {locked ? (
        <>
          <input type="hidden" name="result_kind" value={kind} />
          <input type="hidden" name="format" value={format} />
          <input type="hidden" name="pool_size" value={poolSize} />
          <p className="text-xs text-muted-foreground">Reset this sport&apos;s matches to change its format.</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Pools, then placing brackets: groups play a round robin in pools, then Gold, Silver and Bronze decide every place. By hand: you add each match and type the places.</p>
      )}
    </div>
  );
}
