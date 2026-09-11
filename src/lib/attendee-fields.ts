import { slugify } from "@/lib/slug";
import type { RegistrationQuestion } from "@/lib/types";

/**
 * Columns an organiser adds to the attendee table after registration has closed — room
 * number, flight, dietary note, whatever this event turns out to need. They are defined
 * per event and their values live in `attendees.extra`, keyed by `key`, so adding one
 * never changes the attendee table's schema.
 *
 * `key` is derived from the label once, at creation, and then frozen: renaming a column
 * must not orphan the values already stored under the old key.
 */
export type AttendeeFieldType = "text" | "number" | "date" | "select";

export type AttendeeField = {
  key: string;
  label: string;
  type: AttendeeFieldType;
  /** Only for `select`. Always present on a select, never on the others. */
  options?: string[];
};

export const MAX_ATTENDEE_FIELDS = 12;
export const ATTENDEE_FIELD_TYPES: AttendeeFieldType[] = ["text", "number", "date", "select"];

export const FIELD_TYPE_LABELS: Record<AttendeeFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Choice",
};

/** Keys the attendee row already owns. A column called "Email" would be a trap, not a feature. */
const RESERVED_KEYS = new Set(["id", "name", "email", "phone", "company", "category", "table", "table_no", "source", "status", "token", "extra"]);

export function fieldKey(label: string): string {
  return slugify(label).replace(/-/g, "_");
}

const isType = (v: unknown): v is AttendeeFieldType => ATTENDEE_FIELD_TYPES.includes(v as AttendeeFieldType);

/**
 * Reads the stored jsonb. Anything malformed is dropped rather than thrown: a column
 * definition that went bad must not take the whole attendee list down with it on event day.
 */
export function parseAttendeeFields(raw: unknown): AttendeeField[] {
  if (!Array.isArray(raw)) return [];
  const out: AttendeeField[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!key || !label || seen.has(key)) continue;
    const type = isType(r.type) ? r.type : "text";
    const options = Array.isArray(r.options)
      ? Array.from(new Set(r.options.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean)))
      : [];
    if (type === "select" && options.length === 0) continue; // a choice with no choices is unusable
    seen.add(key);
    out.push({ key, label, type, ...(type === "select" ? { options } : {}) });
    if (out.length >= MAX_ATTENDEE_FIELDS) break;
  }
  return out;
}

export type FieldResult = { ok: true; fields: AttendeeField[] } | { ok: false; error: string };

export function addField(fields: AttendeeField[], input: { label: string; type: string; options: string }, reserved: string[] = []): FieldResult {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Give the column a name" };
  if (label.length > 40) return { ok: false, error: "Column names are limited to 40 characters" };
  if (fields.length >= MAX_ATTENDEE_FIELDS) return { ok: false, error: `You can have at most ${MAX_ATTENDEE_FIELDS} columns` };

  const key = fieldKey(label);
  if (!key) return { ok: false, error: "Use letters or numbers in the column name" };
  if (RESERVED_KEYS.has(key)) return { ok: false, error: `“${label}” is already a built-in column` };
  if (reserved.includes(key)) return { ok: false, error: `“${label}” is already a question on the registration form` };
  if (fields.some((f) => f.key === key)) return { ok: false, error: `You already have a column called “${label}”` };

  const type = isType(input.type) ? input.type : "text";
  const options = parseOptions(input.options);
  if (type === "select" && options.length === 0) return { ok: false, error: "List the choices, separated by commas" };

  return { ok: true, fields: [...fields, { key, label, type, ...(type === "select" ? { options } : {}) }] };
}

/** Changes the label only. The key stays put, so the values already stored keep their home. */
export function renameField(fields: AttendeeField[], key: string, label: string): FieldResult {
  const next = label.trim();
  if (!next) return { ok: false, error: "Give the column a name" };
  if (next.length > 40) return { ok: false, error: "Column names are limited to 40 characters" };
  if (!fields.some((f) => f.key === key)) return { ok: false, error: "That column no longer exists" };
  return { ok: true, fields: fields.map((f) => (f.key === key ? { ...f, label: next } : f)) };
}

/**
 * Drops the definition. The values stay in `extra` untouched — deleting a column should
 * cost a click to undo, not a restore from backup, so re-adding it under the same name
 * brings the data straight back.
 */
export function removeField(fields: AttendeeField[], key: string): AttendeeField[] {
  return fields.filter((f) => f.key !== key);
}

export function parseOptions(raw: string): string[] {
  return Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))).slice(0, 40);
}

/** Normalises one posted value. Anything a field cannot hold becomes blank rather than junk. */
export function coerceFieldValue(field: AttendeeField, raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (v === "") return "";
  switch (field.type) {
    case "select":
      return field.options?.includes(v) ? v : "";
    case "number":
      return /^-?\d+(\.\d+)?$/.test(v) ? v : "";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
    default:
      return v.slice(0, 200);
  }
}

/**
 * The posted values for the defined columns, read from `f_<key>` inputs.
 *
 * A key the form did not carry at all is skipped, not blanked: only a form that actually
 * renders a column may clear it. That keeps a form which shows a subset of the columns
 * (or none) from wiping the rest on save.
 */
export function fieldValuesFromForm(fields: AttendeeField[], get: (key: string) => string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = get(`f_${f.key}`);
    if (raw === null) continue;
    out[f.key] = coerceFieldValue(f, raw);
  }
  return out;
}

/**
 * Whether a raw `extra` key is the same thing as a defined column under another spelling.
 * Import stores an unrecognised header verbatim ("Shirt Size"), registration stores its
 * answers already slugged ("shirt_size"), and a column made later derives its key from
 * the label — so the same fact can be sitting under three names.
 */
export function keyMatchesField(key: string, field: AttendeeField): boolean {
  return key === field.key || key.toLowerCase() === field.label.toLowerCase() || fieldKey(key) === field.key;
}

/**
 * Moves a value already stored under another spelling onto a newly created column, so
 * adding "Shirt size" picks up what an import or the registration form already collected
 * instead of showing an empty column beside the data.
 *
 * Returns null when there is nothing to move. A value already under the column's own key
 * wins — but the stray copy still goes, or the export would carry the column twice.
 */
export function adoptValue(extra: Record<string, string>, field: AttendeeField): Record<string, string> | null {
  const match = Object.keys(extra).find((k) => k !== field.key && keyMatchesField(k, field));
  if (match === undefined) return null;
  const next = { ...extra };
  delete next[match];
  next[field.key] = extra[field.key] || extra[match];
  return next;
}

/**
 * Values on the attendees that no column has claimed yet, commonest first — what the
 * "add a column" dialog offers, so populating a column is usually one click rather than
 * a hundred keystrokes. Blank values do not count towards a suggestion; a key where
 * everyone is blank is not worth surfacing.
 */
export function unclaimedKeys(extras: Record<string, string>[], fields: AttendeeField[], limit = 12): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const extra of extras) {
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (!v) continue;
      if (fields.some((f) => keyMatchesField(k, f))) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  // Commonest first, then alphabetical. The tie-break compares lowercased keys with plain
  // operators rather than `localeCompare`, so the order does not depend on the locale the
  // server happens to be running under.
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      const x = a.key.toLowerCase(), y = b.key.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    })
    .slice(0, limit);
}

/** A stored key turned back into something worth showing as a column name. */
export function labelFromKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/**
 * The registration form's questions, as columns. Their answers already live in `extra`
 * under the question key, so they are columns whether or not anyone declares them — which
 * is why they are derived here rather than added by hand. A `select` that lost its
 * choices falls back to free text so the answer stays editable.
 */
export function fieldsFromQuestions(questions: RegistrationQuestion[]): AttendeeField[] {
  return questions.map((q) => {
    const options = q.options?.map((o) => o.trim()).filter(Boolean) ?? [];
    return q.type === "select" && options.length > 0
      ? { key: q.key, label: q.label, type: "select" as const, options }
      : { key: q.key, label: q.label, type: "text" as const };
  });
}

/**
 * Every column an attendee's `extra` can hold: what the registration form asks, then what
 * the organiser added afterwards. This is the list the table, the attendee panel, the
 * import matcher and the export all work from — `attendee_fields` alone is only the
 * second half.
 */
export function eventFields(questions: RegistrationQuestion[], custom: AttendeeField[]): AttendeeField[] {
  const fromForm = fieldsFromQuestions(questions);
  const claimed = new Set(fromForm.map((f) => f.key));
  return [...fromForm, ...custom.filter((f) => !claimed.has(f.key))];
}
