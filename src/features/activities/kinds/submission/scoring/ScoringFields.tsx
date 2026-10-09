"use client";
import { useState } from "react";
import { stepsText } from "../../../lib/challenge";
import type { Activity } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D372/D376: the setting that makes this form a scored challenge, with its tracker page and
 * leaderboards. Off by default. The fields are not rendered while it is off, so a save never
 * reads stale scoring off an ordinary form. Only number questions that are already saved can
 * be picked; a question added in this same edit appears after the next save.
 */
export function ScoringFields({ activity }: { activity?: Activity }) {
  const s = activity?.scoring ?? null;
  const [on, setOn] = useState(s !== null);
  const numbers = (activity?.questions ?? []).filter((q) => q.type === "number");
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-extrabold">Scoring</legend>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="scoring_on" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4" />
        Score this as a challenge
      </label>
      {on && (
        <>
          <label className="grid gap-1.5 text-sm"><span className="font-bold">Score question</span>
            <select name="scoring_metric" defaultValue={s?.metric_key ?? numbers[0]?.key ?? ""} className={input} required>
              {numbers.length === 0 && <option value="">Save a number question first</option>}
              {numbers.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
            </select></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Starts</span>
              <input type="date" name="scoring_starts_on" defaultValue={s?.starts_on ?? ""} className={input} required /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Ends</span>
              <input type="date" name="scoring_ends_on" defaultValue={s?.ends_on ?? ""} className={input} required /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Daily minimum</span>
              <input name="scoring_daily_min" inputMode="decimal" defaultValue={s?.daily_min ?? 1} className={`${input} tabular-nums`} required /></label>
          </div>
          <label className="grid gap-1.5 text-sm"><span className="font-bold">Daily points steps (optional)</span>
            <input name="scoring_steps" defaultValue={stepsText(s?.daily_steps)} placeholder="1=1, 3=2, 5=4, 8=6, 10=8" className={input} />
            <span className="text-xs text-muted-foreground">Total=points for a person&apos;s day, smallest first.</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Weekly team bonus (optional)</span>
              <input name="scoring_team_bonus" inputMode="numeric" defaultValue={s?.team_bonus ?? ""} placeholder="20" className={`${input} tabular-nums`} />
              <span className="text-xs text-muted-foreground">When every member logs the daily minimum on every day of the week.</span></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Weekly podium points (optional)</span>
              <input name="scoring_podium" defaultValue={(s?.podium ?? []).join(", ")} placeholder="20, 12, 6" className={`${input} tabular-nums`} />
              <span className="text-xs text-muted-foreground">For the teams with the most total in the week, 1st first.</span></label>
          </div>
        </>
      )}
    </fieldset>
  );
}
