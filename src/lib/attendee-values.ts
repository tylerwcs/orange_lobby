import type { Attendee } from "@/lib/types";

/**
 * The columns migration 0014 copies into `extra` and a later migration drops. Nothing
 * outside this file should name them.
 */
export const LEGACY_COLUMN_KEYS = ["company", "phone", "table_no"] as const;

const LEGACY = new Set<string>(LEGACY_COLUMN_KEYS);

/**
 * One field's value for one attendee: `extra` first, then the column it used to live in.
 *
 * TEMPORARY. This exists so the code that writes fields and the migration that moves the
 * data can land in separate deploys — the pattern floorPlanUrl() documents in modules.ts.
 * It goes in the contract step, along with the columns.
 *
 * The fallback tests for the key's ABSENCE, not for a blank: an organiser who clears a
 * company writes "", which is present, and must not have the old column answer for it.
 */
export function fieldValue(a: Pick<Attendee, "extra"> & Record<string, unknown>, key: string): string {
  const extra = a.extra ?? {};
  if (key in extra) return (extra[key] ?? "").trim();
  if (!LEGACY.has(key)) return "";
  const column = a[key];
  return typeof column === "string" ? column.trim() : "";
}
