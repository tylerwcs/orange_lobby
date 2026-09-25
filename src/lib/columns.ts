import type { AttendeeField } from "@/lib/attendee-fields";

/**
 * The facts that used to be columns on the attendee row, before migration 0014 made them
 * ordinary fields. They are ordinary now in every respect but two: they are visible by
 * default like the built-ins they replaced, and the exports keep them in their old fixed
 * positions. Both of those are promises to people, not properties of the data.
 *
 * Company was the third and is not here any more. It kept more of its old privileges than
 * the other two — a line on the badge, the portal identity card, the crew search subtitle,
 * a column in every export — and an event that does not collect a company paid for all of
 * them. It is now a field like any other: shown where the event asks for it, absent where
 * it does not.
 */
export const FORMER_BUILTIN_KEYS = ["phone", "table_no"] as const;

/**
 * Where a column comes from, which decides what its header menu may offer: a built-in is
 * part of the attendee row, a registration column is owned by the form in Settings, a
 * breakout round is owned by the agenda, and only a custom one can be renamed or deleted
 * from the table.
 */
export type ColumnSource = "builtin" | "registration" | "custom" | "breakout";

export type ColumnDef = { key: string; label: string; source: ColumnSource };

/**
 * Name is deliberately absent: it is the row's handle — the link into the attendee — so
 * hiding it would leave a table of details with nothing to open.
 */
export const BUILTIN_COLUMNS: ColumnDef[] = [
  { key: "email", label: "Email", source: "builtin" },
  { key: "category", label: "Category", source: "builtin" },
  { key: "checked_in", label: "Checked in", source: "builtin" },
  { key: "source", label: "Source", source: "builtin" },
];

/**
 * The table's columns in reading order: the attendee row's own, then what the
 * registration form asked, then what the organiser added. Registration questions are
 * columns automatically — their answers are already on file, so making someone re-declare
 * them would be asking for work the system can do itself.
 */
export function allColumns(
  registrationFields: AttendeeField[],
  customFields: AttendeeField[],
  breakoutFields: AttendeeField[] = [],
): ColumnDef[] {
  const claimed = new Set(registrationFields.map((f) => f.key));
  return [
    ...BUILTIN_COLUMNS,
    ...registrationFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "registration" })),
    ...customFields.filter((f) => !claimed.has(f.key)).map((f): ColumnDef => ({ key: f.key, label: f.label, source: "custom" })),
    ...breakoutFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "breakout" })),
  ];
}

/** The cookie is per event, so hiding Table on one event does not hide it on the next. */
export function columnsCookieName(eventId: string): string {
  return `ol-cols-${eventId}`;
}

/** Where the table layout lives: which columns the reader has hidden. */
export function tableCookieName(eventId: string): string {
  return `ol-table-${eventId}`;
}

/**
 * One reader's table layout: what is hidden, in what order, at what widths. Order and widths
 * were dropped in the shadcn revamp, when a table showed six columns; an imported masterlist
 * brings twenty, and they are back. Name is always first and always shown, but it can be
 * sized: with Email hidden it carries the address beneath the name, and is the widest column.
 */
export type TablePrefs = {
  hidden: string[];
  /** Column keys in display order. Keys not listed follow, in the table's own order. */
  order: string[];
  /** Pixel widths for the columns someone has dragged. Absent means sized by content. */
  widths: Record<string, number>;
};

export const MIN_COLUMN_WIDTH = 72;
export const MAX_COLUMN_WIDTH = 640;

export const clampWidth = (n: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(n)));

/**
 * Columns in the reader's chosen order: the ones they have placed, then anything that
 * arrived since — a column an import added lands on the right rather than disappearing
 * because an older preference never mentioned it.
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
 * Reads the stored layout, dropping anything that is no longer a column. A preference is
 * the one input a user can corrupt by hand, so anything unrecognised is discarded rather
 * than trusted.
 *
 * `legacyHidden` is the value of the older hide-only cookie, so an organiser who had
 * already tuned their columns does not lose that.
 */
/**
 * What a table shows before anyone has chosen: the attendee's own columns, and nothing
 * else. A registration form's answers are columns too, which for the KOM means fifteen of
 * them — a horizontal scroll nobody reads across. They are one tick away in the Columns
 * menu, and the attendee panel shows every one of them for a single person anyway.
 *
 * This is a default, not a rule: the moment someone opens the Columns menu their choice is
 * written to the cookie and this stops applying.
 */
export function defaultHidden(columns: ColumnDef[]): string[] {
  return columns
    // A breakout round is the exception to "everything but the built-ins starts hidden":
    // the column exists so an organiser can see who is in which room without opening
    // anybody, and a hidden one is the same as no column at all.
    .filter((c) => c.source !== "breakout")
    // Mobile and Table left BUILTIN_COLUMNS when migration 0014 turned them into ordinary
    // fields, but a viewer opening the table for the first time — a new laptop at the
    // registration desk — still needs to see them without opening the Columns menu, the same
    // as before the migration. EX_BUILTIN_KEYS is what keeps them out of this list. Company
    // was the third and gave the slot up: see FORMER_BUILTIN_KEYS.
    .filter((c) => c.source !== "builtin" || DEFAULT_HIDDEN_BUILTINS.has(c.key))
    .filter((c) => !EX_BUILTIN_KEYS.has(c.key))
    .map((c) => c.key);
}

const EX_BUILTIN_KEYS = new Set<string>(FORMER_BUILTIN_KEYS);

/**
 * Two of the attendee's own columns start hidden as well. `email` is a contact detail
 * rendered under the name or on the attendee panel, where it identifies a row without
 * costing a column; `source` records how somebody got on the list, which matters when
 * reconciling an import and never while working the door.
 */
const DEFAULT_HIDDEN_BUILTINS = new Set(["email", "source"]);

export function parseTablePrefs(raw: string | undefined, columns: ColumnDef[], legacyHidden?: string): TablePrefs {
  const known = new Set(["name", ...columns.map((c) => c.key)]);
  const empty: TablePrefs = { hidden: [], order: [], widths: {} };
  if (!raw) {
    const legacy = hiddenFromCookie(legacyHidden, columns);
    return { ...empty, hidden: legacyHidden ? legacy : defaultHidden(columns) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    try { parsed = JSON.parse(raw); } catch { return empty; }
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const r = parsed as { hidden?: unknown; order?: unknown; widths?: unknown };

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  // `name` is never hidden or moved, so a stored preference claiming otherwise is ignored.
  const keys = (v: unknown) => Array.from(new Set(strings(v).filter((k) => k !== "name" && known.has(k))));
  const widths: Record<string, number> = {};
  if (typeof r.widths === "object" && r.widths !== null && !Array.isArray(r.widths)) {
    for (const [k, v] of Object.entries(r.widths as Record<string, unknown>)) {
      if (known.has(k) && typeof v === "number" && Number.isFinite(v)) widths[k] = clampWidth(v);
    }
  }
  return { hidden: keys(r.hidden), order: keys(r.order), widths };
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
 * Category is the only row column a bulk edit may set: name and email are per-person,
 * check-in has its own control, and source records how someone got on the list.
 */
export const BULK_BUILTIN_FIELDS: AttendeeField[] = [
  { key: "category", label: "Category", type: "text" },
];

export const BULK_BUILTIN_KEYS = BULK_BUILTIN_FIELDS.map((f) => f.key);

export function bulkFields(eventFields: AttendeeField[]): AttendeeField[] {
  return [...BULK_BUILTIN_FIELDS, ...eventFields];
}
