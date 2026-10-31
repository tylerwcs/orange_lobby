"use client";

import { useState, type ReactNode } from "react";
import type { ProxyGroup } from "@/features/tracks/client";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D776: a captain's "Submitting for" on a track pair - the whole team by track - and below it the
 * form of the picked person's track, each with its own questions, so the entry is sent to the
 * track it counts on. Only that one form is mounted (the two share field ids); the select joins
 * it through `form=`, posting `:for` as SubmitFor does. A switch clears what was typed.
 */
export function TrackSubmitFor({ groups, defaultValue, hereId, formId, forms }: {
  groups: ProxyGroup[]; defaultValue: string; hereId: string; formId: string; forms: Record<string, ReactNode>;
}) {
  const [value, setValue] = useState(defaultValue);
  const on = groups.find((g) => g.activityId !== null && g.choices.some((c) => c.value === value)) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldLabel htmlFor="submit-for">Submitting for</FieldLabel>
        <select id="submit-for" name=":for" form={formId} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
          {groups.map((g) => (
            <optgroup key={g.activityId ?? "none"} label={g.label}>
              {g.choices.map((c) => <option key={c.value} value={c.value} disabled={g.activityId === null}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
        <FieldDescription>
          {value === ""
            ? on && on.activityId !== hereId ? `Saved on ${on.label}, your track.` : ""
            : `${on && on.activityId !== hereId ? `Saved on ${on.label}, their track. ` : ""}It counts as theirs, and says you added it.`}
        </FieldDescription>
      </Field>
      {on?.activityId ? <div key={on.activityId}>{forms[on.activityId]}</div> : null}
    </div>
  );
}
