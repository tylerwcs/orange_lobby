import type { Event } from "@/lib/types";

/**
 * The optional attendee facts an event may or may not collect.
 *
 * Deliberately short, and deliberately not `name`, `email`, `category` or check-in: those
 * carry behaviour (the import matches on email, the agenda filters on category, the
 * scanner writes check-ins), so they are features rather than columns and cannot be
 * turned off. These three carry none — they are just facts, and plenty of events want
 * none of them.
 */
export const COLLECTED_FIELDS = ["company", "phone", "table_no"] as const;
export type CollectedField = (typeof COLLECTED_FIELDS)[number];

export const COLLECTED_FIELD_LABELS: Record<CollectedField, string> = {
  company: "Company",
  phone: "Mobile",
  table_no: "Table",
};

const KNOWN = new Set<string>(COLLECTED_FIELDS);

/**
 * Reads the stored array. Anything unrecognised is dropped rather than thrown — a bad row
 * must not take the attendee list down on event day, it must simply collect less.
 *
 * A row with no array at all (a database where migration 0008 has not run yet) reads as
 * all three, which is what every event did before this existed.
 */
export function parseCollectedFields(raw: unknown): CollectedField[] {
  if (!Array.isArray(raw)) return [...COLLECTED_FIELDS];
  const seen = new Set<CollectedField>();
  for (const v of raw) if (typeof v === "string" && KNOWN.has(v)) seen.add(v as CollectedField);
  // Kept in the canonical order rather than the order they were stored, so the forms and
  // the table always read Company, Mobile, Table whatever order someone ticked them in.
  return COLLECTED_FIELDS.filter((f) => seen.has(f));
}

export function collects(event: Pick<Event, "collected_fields">, field: CollectedField): boolean {
  return event.collected_fields.includes(field);
}

/** Reads the ticked boxes back off the settings form. */
export function collectedFromForm(values: string[]): CollectedField[] {
  return parseCollectedFields(values);
}
