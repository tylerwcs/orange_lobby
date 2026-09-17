import type { Attendee } from "@/lib/types";

/**
 * One field's value for one attendee, trimmed.
 *
 * Every fact an event collects beyond name, email and category lives in `extra`, so this
 * is the only place that needs to know how to read one. It used to fall back to the
 * columns `company`, `phone` and `table_no` while migration 0014 moved their values; those
 * columns are gone and so is the fallback.
 */
export function fieldValue(a: Pick<Attendee, "extra">, key: string): string {
  return (a.extra?.[key] ?? "").trim();
}
