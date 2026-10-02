"use client";
import { useState } from "react";
import type { Activity, GroupMode } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

const MODES: { value: GroupMode; label: string; hint: string }[] = [
  { value: "off", label: "Each attendee", hint: "Everyone submits for themselves." },
  { value: "entries", label: "Group — set number of entries", hint: "Any member submits for the group, until it has the entries it needs." },
  { value: "everyone", label: "Group — every member", hint: "Each member submits once. The group is done when all of them have." },
  { value: "members", label: "Each member, counted by team", hint: "Every team member submits their own entries, as often as they like. Each entry counts for their team." },
];

/**
 * D350/D351: who submits, and the per-person rules only when it is each attendee. The hidden
 * fields are not rendered at all under a group mode, so `readSubmissionPolicy` never reads a
 * stale per-day tick off a group form.
 */
export function WhoSubmitsFields({ activity }: { activity?: Activity }) {
  const [mode, setMode] = useState<GroupMode>(activity?.group_mode ?? "off");
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Who submits</legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="group_mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5 size-4" />
            <span><span className="font-bold">{m.label}</span><span className="block text-muted-foreground">{m.hint}</span></span>
          </label>
        ))}
      </fieldset>
      {mode === "entries" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="group_target" className="text-sm font-bold">Entries per group</label>
          <input id="group_target" name="group_target" type="number" min={1} max={50} required
            defaultValue={activity?.group_target ?? 1} inputMode="numeric" className={`${input} max-w-32 tabular-nums`} />
        </div>
      )}
      {mode === "off" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="max_per_attendee" className="text-sm font-bold">Total submissions per person (optional)</label>
            <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={366}
              defaultValue={activity?.max_per_attendee ?? ""} placeholder="Unlimited" inputMode="numeric" className={`${input} max-w-32 tabular-nums`} />
          </div>
          <label className={check}>
            <input type="checkbox" name="per_day" defaultChecked={activity?.per_day ?? false} className="size-4" />
            At most one submission per day, on top of the total above
          </label>
        </>
      )}
    </>
  );
}
