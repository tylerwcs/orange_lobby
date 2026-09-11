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

/** Where the whole table layout lives now: what is hidden, in what order, at what widths. */
export function tableCookieName(eventId: string): string {
  return `ol-table-${eventId}`;
}

export const MIN_COLUMN_WIDTH = 72;
export const MAX_COLUMN_WIDTH = 640;
export const SELECT_COLUMN_WIDTH = 44;
export const DEFAULT_COLUMN_WIDTH = 170;

/** Sensible starting widths. A name needs room; a table number does not. */
export const DEFAULT_WIDTHS: Record<string, number> = {
  name: 220, email: 230, company: 180, category: 140, table_no: 90, checked_in: 130, source: 110,
};

export type TablePrefs = {
  hidden: string[];
  /** Every known column key, in display order. Unknown keys are dropped, new ones appended. */
  order: string[];
  widths: Record<string, number>;
};

export function defaultWidth(key: string): number {
  return DEFAULT_WIDTHS[key] ?? DEFAULT_COLUMN_WIDTH;
}

export function columnWidth(key: string, widths: Record<string, number>): number {
  return widths[key] ?? defaultWidth(key);
}

const clampWidth = (n: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(n)));

/**
 * Columns in the reader's chosen order: the ones they have placed, then anything that
 * arrived since — a question added to the registration form lands on the right rather
 * than disappearing because an old preference never mentioned it.
 */
export function orderedColumns(columns: ColumnDef[], order: string[]): ColumnDef[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const placed: ColumnDef[] = [];
  for (const key of order) {
    const col = byKey.get(key);
    if (col) { placed.push(col); byKey.delete(key); }
  }
  return [...placed, ...columns.filter((c) => byKey.has(c.key))];
}

/**
 * Reads the stored layout, dropping anything that is no longer a column and clamping any
 * width that is. A preference file is the one input a user can corrupt by hand, and a
 * table nobody can read because one column is four pixels wide is not a good failure.
 *
 * `legacyHidden` is the value of the older hide-only cookie, so an organiser who had
 * already tuned their columns does not lose that the day ordering ships.
 */
export function parseTablePrefs(raw: string | undefined, columns: ColumnDef[], legacyHidden?: string): TablePrefs {
  const known = new Set(["name", ...columns.map((c) => c.key)]);
  const empty: TablePrefs = { hidden: [], order: [], widths: {} };
  if (!raw) return { ...empty, hidden: hiddenFromCookie(legacyHidden, columns) };

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    try { parsed = JSON.parse(raw); } catch { return empty; }
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const r = parsed as { hidden?: unknown; order?: unknown; widths?: unknown };

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const widths: Record<string, number> = {};
  if (typeof r.widths === "object" && r.widths !== null) {
    for (const [k, v] of Object.entries(r.widths as Record<string, unknown>)) {
      if (known.has(k) && typeof v === "number" && Number.isFinite(v)) widths[k] = clampWidth(v);
    }
  }
  return {
    // `name` is never hideable, so a stored preference claiming otherwise is ignored.
    hidden: Array.from(new Set(strings(r.hidden).filter((k) => k !== "name" && known.has(k)))),
    order: Array.from(new Set(strings(r.order).filter((k) => known.has(k)))),
    widths,
  };
}

export function serialiseTablePrefs(prefs: TablePrefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
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
