import type { AttendeeField } from "@/lib/attendee-fields";

export type ColumnDef = {
  key: string;
  label: string;
  /** Custom columns can be renamed and deleted from their header menu; built-ins cannot. */
  custom: boolean;
};

/**
 * Name is deliberately absent: it is the row's handle — the link into the attendee — so
 * hiding it would leave a table of details with nothing to open.
 */
export const BUILTIN_COLUMNS: ColumnDef[] = [
  { key: "email", label: "Email", custom: false },
  { key: "company", label: "Company", custom: false },
  { key: "category", label: "Category", custom: false },
  { key: "table_no", label: "Table", custom: false },
  { key: "checked_in", label: "Checked in", custom: false },
  { key: "source", label: "Source", custom: false },
];

export function allColumns(fields: AttendeeField[]): ColumnDef[] {
  return [...BUILTIN_COLUMNS, ...fields.map((f) => ({ key: f.key, label: f.label, custom: true }))];
}

/** The cookie is per event, so hiding Company on one event does not hide it on the next. */
export function columnsCookieName(eventId: string): string {
  return `ol-cols-${eventId}`;
}

/**
 * Reads the stored preference, dropping anything that is no longer a column — a deleted
 * custom field must not keep a slot in the hidden list forever, and a stale cookie from
 * another build must not hide something that no longer exists.
 */
export function hiddenFromCookie(raw: string | undefined, columns: ColumnDef[]): string[] {
  if (!raw) return [];
  // The value is written plain, but cookie readers differ on whether they decode, so
  // accept either spelling rather than silently showing every column.
  let value = raw;
  try { value = decodeURIComponent(raw); } catch { /* not encoded */ }
  const known = new Set(columns.map((c) => c.key));
  return Array.from(new Set(value.split(",").map((s) => s.trim()).filter((s) => known.has(s))));
}

export function hiddenToCookie(hidden: Iterable<string>): string {
  return Array.from(new Set(hidden)).join(",");
}

export function visibleColumns(columns: ColumnDef[], hidden: Iterable<string>): ColumnDef[] {
  const skip = new Set(hidden);
  return columns.filter((c) => !skip.has(c.key));
}
