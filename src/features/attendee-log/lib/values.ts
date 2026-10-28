import { fieldValue } from "@/lib/attendee-values";
import type { Attendee } from "@/lib/types";
import type { FieldChange, FieldValue, LogLabels } from "../types";

/** Trimmed, with null and undefined as "". */
export const blank = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * An attendee as labelled values, in the order a person reads them: Name, Email, Category,
 * each column, Group, then one line per breakout round. Blanks are left out, so "no value"
 * and "never set" look the same in a diff.
 */
export function attendeeValues(
  a: Pick<Attendee, "name" | "email" | "category" | "extra" | "group_id"> & { id: string },
  labels: LogLabels,
): FieldValue[] {
  const out: FieldValue[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const v = blank(value);
    if (v) out.push({ label, value: v });
  };
  add("Name", a.name);
  add("Email", a.email);
  add("Category", a.category);
  for (const f of labels.fields) add(f.label, fieldValue(a, f.key));
  add("Group", a.group_id ? labels.groupName.get(a.group_id) : "");
  const rooms = labels.roomsOf.get(a.id);
  if (rooms) for (const [round, room] of Object.entries(rooms)) add(`${round} room`, room);
  return out;
}

/** Old → new by label: `after` order first, then labels only `before` had. A blank and a missing value are the same. */
export function diffValues(before: FieldValue[], after: FieldValue[]): FieldChange[] {
  const was = new Map<string, string>();
  for (const v of before) was.set(v.label, blank(v.value));
  const out: FieldChange[] = [];
  const seen = new Set<string>();
  for (const v of after) {
    seen.add(v.label);
    const b = was.get(v.label) ?? "";
    const n = blank(v.value);
    if (b !== n) out.push({ label: v.label, before: b, after: n });
  }
  for (const [label, b] of was) {
    if (!seen.has(label) && b !== "") out.push({ label, before: b, after: "" });
  }
  return out;
}
