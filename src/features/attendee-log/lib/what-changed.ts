import type { AttendeeChange } from "../types";

/** What the log table's "What changed" cell shows. No `before` means a bulk set: `label → after`. */
export type WhatChanged = { label: string; before?: string; after: string };

/**
 * D746: the log row's at-a-glance value. One person with one field changed reads
 * `label: before → after`; a bulk set that gave everyone the same label and the same new value
 * reads `label → after`. Anything bigger (several fields, several people, a delete, an import)
 * is null: the View button carries it.
 */
export function whatChanged(change: Pick<AttendeeChange, "kind" | "people">): WhatChanged | null {
  const { kind, people } = change;
  if (kind === "bulk_set") {
    const first = people[0]?.fields?.[0];
    if (!first) return null;
    const same = people.every((p) => p.fields?.length === 1 && p.fields[0].label === first.label && p.fields[0].after === first.after);
    return same ? { label: first.label, after: first.after } : null;
  }
  if (people.length !== 1) return null;
  const fields = people[0].fields;
  if (!fields || fields.length !== 1) return null;
  return { label: fields[0].label, before: fields[0].before, after: fields[0].after };
}
