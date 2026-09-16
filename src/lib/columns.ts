import type { AttendeeField } from "@/lib/attendee-fields";
import { COLLECTED_FIELDS, type CollectedField } from "@/lib/collected-fields";

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
  { key: "company", label: "Company", source: "builtin" },
  { key: "phone", label: "Mobile", source: "builtin" },
  { key: "category", label: "Category", source: "builtin" },
  { key: "table_no", label: "Table", source: "builtin" },
  { key: "checked_in", label: "Checked in", source: "builtin" },
  { key: "source", label: "Source", source: "builtin" },
];

/** The built-ins an event can switch off entirely, as opposed to merely hide. */
const OPTIONAL_KEYS = new Set<string>(COLLECTED_FIELDS);

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
  collected: CollectedField[] = [...COLLECTED_FIELDS],
): ColumnDef[] {
  const claimed = new Set(registrationFields.map((f) => f.key));
  const uses = new Set<string>(collected);
  return [
    // A field this event does not collect has no column at all, rather than a hidden one:
    // a hidden column is something you can tick back on by accident, and there would be
    // nothing behind it.
    ...BUILTIN_COLUMNS.filter((c) => !OPTIONAL_KEYS.has(c.key) || uses.has(c.key)),
    ...registrationFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "registration" })),
    ...customFields.filter((f) => !claimed.has(f.key)).map((f): ColumnDef => ({ key: f.key, label: f.label, source: "custom" })),
    ...breakoutFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "breakout" })),
  ];
}

/** The cookie is per event, so hiding Company on one event does not hide it on the next. */
export function columnsCookieName(eventId: string): string {
  return `ol-cols-${eventId}`;
}

/** Where the table layout lives: which columns the reader has hidden. */
export function tableCookieName(eventId: string): string {
  return `ol-table-${eventId}`;
}

/**
 * Visibility is the whole layout now. Column order and per-column widths were dragged
 * from the header and stored here too; both were dropped in the shadcn revamp (the
 * organiser did not use them, and they were the only reason the table needed a fixed
 * layout and a horizontal scroller of its own). Stored cookies still carrying `order` and
 * `widths` parse fine — the extra keys are ignored — so nobody loses their hidden columns.
 */
export type TablePrefs = {
  hidden: string[];
};

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
    .filter((c) => c.source !== "builtin" || DEFAULT_HIDDEN_BUILTINS.has(c.key))
    .map((c) => c.key);
}

/**
 * Three of the attendee's own columns start hidden as well. `email` and `phone` are contact
 * details rendered under the name or on the attendee panel, where they identify a row
 * without costing a column; `source` records how somebody got on the list, which matters
 * when reconciling an import and never while working the door.
 */
const DEFAULT_HIDDEN_BUILTINS = new Set(["email", "phone", "source"]);

export function parseTablePrefs(raw: string | undefined, columns: ColumnDef[], legacyHidden?: string): TablePrefs {
  const known = new Set(["name", ...columns.map((c) => c.key)]);
  const empty: TablePrefs = { hidden: [] };
  if (!raw) {
    const legacy = hiddenFromCookie(legacyHidden, columns);
    return { hidden: legacyHidden ? legacy : defaultHidden(columns) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    try { parsed = JSON.parse(raw); } catch { return empty; }
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const r = parsed as { hidden?: unknown };

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    // `name` is never hideable, so a stored preference claiming otherwise is ignored.
    hidden: Array.from(new Set(strings(r.hidden).filter((k) => k !== "name" && known.has(k)))),
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

export function bulkFields(eventFields: AttendeeField[], collected: CollectedField[] = [...COLLECTED_FIELDS]): AttendeeField[] {
  const uses = new Set<string>(collected);
  return [...BULK_BUILTIN_FIELDS.filter((f) => !OPTIONAL_KEYS.has(f.key) || uses.has(f.key)), ...eventFields];
}
