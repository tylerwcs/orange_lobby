import type { AttendeeField } from "@/lib/attendee-fields";

/**
 * Where a column comes from, which decides what its header menu may offer: a built-in is
 * part of the attendee row, a registration column is owned by the form in Settings, and
 * only a custom one can be renamed or deleted from the table.
 */
export type ColumnSource = "builtin" | "registration" | "custom";

export type ColumnDef = { key: string; label: string; source: ColumnSource };

/**
 * Name is deliberately absent: it is the row's handle — the link into the attendee — so
 * hiding it would leave a table of details with nothing to open.
 */
export const BUILTIN_COLUMNS: ColumnDef[] = [
  { key: "email", label: "Email", source: "builtin" },
  { key: "company", label: "Company", source: "builtin" },
  { key: "category", label: "Category", source: "builtin" },
  { key: "table_no", label: "Table", source: "builtin" },
  { key: "checked_in", label: "Checked in", source: "builtin" },
  { key: "source", label: "Source", source: "builtin" },
];

/**
 * The table's columns in reading order: the attendee row's own, then what the
 * registration form asked, then what the organiser added. Registration questions are
 * columns automatically — their answers are already on file, so making someone re-declare
 * them would be asking for work the system can do itself.
 */
export function allColumns(registrationFields: AttendeeField[], customFields: AttendeeField[]): ColumnDef[] {
  const claimed = new Set(registrationFields.map((f) => f.key));
  return [
    ...BUILTIN_COLUMNS,
    ...registrationFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "registration" })),
    ...customFields.filter((f) => !claimed.has(f.key)).map((f): ColumnDef => ({ key: f.key, label: f.label, source: "custom" })),
  ];
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

/**
 * Columns a bulk edit may set for a whole selection. Name, email and phone are per-person
 * and have no business being set in bulk; check-in has its own control; source records
 * how someone got on the list and is not typed.
 *
 * Described as `AttendeeField`s so one piece of UI can render the right control for each —
 * a date picker for a date, a fixed list for a choice.
 */
export const BULK_BUILTIN_FIELDS: AttendeeField[] = [
  { key: "company", label: "Company", type: "text" },
  { key: "category", label: "Category", type: "text" },
  { key: "table_no", label: "Table", type: "text" },
];

export const BULK_BUILTIN_KEYS = BULK_BUILTIN_FIELDS.map((f) => f.key);

export function bulkFields(eventFields: AttendeeField[]): AttendeeField[] {
  return [...BULK_BUILTIN_FIELDS, ...eventFields];
}
