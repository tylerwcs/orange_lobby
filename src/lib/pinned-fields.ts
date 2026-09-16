import { eventFields, type AttendeeField } from "@/lib/attendee-fields";
import type { Attendee, RegistrationQuestion } from "@/lib/types";

/**
 * The handful of facts an event wants on the front of the badge card.
 *
 * Which facts those are changes every event — one client wants the hotel room number, the
 * next wants who you are sharing with — so they are chosen per event rather than built in.
 * `key` names either a column on the attendee row or a key in its `extra`; `label` is an
 * optional short caption, because a column named for an admin table ("Hotel room partner")
 * rarely fits a caption slot.
 */
export type PinnedField = { key: string; label?: string };

/** Three is what the badge card's bottom row holds before it stops being a glance. */
export const MAX_PINS = 3;

/**
 * Native attendee columns that may be pinned. `name` is absent on purpose: it is the
 * heading of the card the pins sit under.
 */
export const NATIVE_PINNABLE: AttendeeField[] = [
  { key: "company", label: "Company", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Mobile", type: "text" },
  { key: "category", label: "Category", type: "text" },
  { key: "table_no", label: "Table", type: "text" },
];

const NATIVE_KEYS = new Set(NATIVE_PINNABLE.map((f) => f.key));

/**
 * Reads the stored jsonb. Anything malformed is dropped rather than thrown — a pin that
 * went bad must not take the portal down on event day, it must simply not render.
 */
export function parsePinnedFields(raw: unknown): PinnedField[] {
  if (!Array.isArray(raw)) return [];
  const out: PinnedField[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    if (!key || seen.has(key)) continue;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    seen.add(key);
    out.push({ key, ...(label ? { label } : {}) });
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

/** The value behind a pin: a column on the row, or a key in `extra`. */
export function pinValue(attendee: Attendee, key: string): string {
  if (NATIVE_KEYS.has(key)) {
    const v = (attendee as unknown as Record<string, unknown>)[key];
    return typeof v === "string" ? v.trim() : "";
  }
  return (attendee.extra?.[key] ?? "").trim();
}

export type ResolvedPin = { key: string; label: string; value: string };

/**
 * The pins this attendee actually has something to show for, in the event's order.
 *
 * A pin is per event; a value is per person. Someone with no room number should see no
 * room caption rather than an empty one — so blanks drop out here, and the badge row is
 * free to disappear entirely when nothing survives.
 */
export function resolvePins(pins: PinnedField[], attendee: Attendee, fields: AttendeeField[]): ResolvedPin[] {
  const known = new Map([...NATIVE_PINNABLE, ...fields].map((f) => [f.key, f]));
  const out: ResolvedPin[] = [];
  for (const pin of pins) {
    const field = known.get(pin.key);
    if (!field) continue; // the column was deleted; the pin stops rendering
    const value = pinValue(attendee, pin.key);
    if (!value) continue;
    out.push({ key: pin.key, label: pin.label || field.label, value });
  }
  return out;
}

/**
 * Everything an event could pin: the native columns, then whatever the registration form
 * asked and the organiser added. `eventFields` already unifies the latter two, so this is
 * the one list the picker, the resolver and the badge all work from.
 */
export function pinnableFields(questions: RegistrationQuestion[], custom: AttendeeField[]): AttendeeField[] {
  const own = eventFields(questions, custom);
  const claimed = new Set(own.map((f) => f.key));
  return [...NATIVE_PINNABLE.filter((f) => !claimed.has(f.key)), ...own];
}

export type PinResult = { ok: true; pins: PinnedField[] } | { ok: false; error: string };

export function addPin(pins: PinnedField[], key: string, label: string): PinResult {
  const k = key.trim();
  if (!k) return { ok: false, error: "Choose a field to pin" };
  if (pins.some((p) => p.key === k)) return { ok: false, error: "That field is already pinned" };
  if (pins.length >= MAX_PINS) return { ok: false, error: `You can pin at most ${MAX_PINS} fields` };
  const short = label.trim().slice(0, 20);
  return { ok: true, pins: [...pins, { key: k, ...(short ? { label: short } : {}) }] };
}

export function removePin(pins: PinnedField[], key: string): PinnedField[] {
  return pins.filter((p) => p.key !== key);
}

/** Rearranges to the posted order. As with tiles, a reorder is never a delete. */
export function reorderPins(pins: PinnedField[], keys: string[]): PinnedField[] {
  const byKey = new Map(pins.map((p) => [p.key, p]));
  const out: PinnedField[] = [];
  for (const k of keys) {
    const p = byKey.get(k);
    if (p) { out.push(p); byKey.delete(k); }
  }
  return [...out, ...byKey.values()];
}

/**
 * Whether a value can carry the badge card's big treatment.
 *
 * The big slot was built for a table number. A room partner's name at that size wraps to
 * three lines and takes the card apart, so anything longer steps down rather than the
 * layout changing shape per attendee.
 */
export function pinScale(value: string): "large" | "small" {
  return value.trim().length <= 8 ? "large" : "small";
}

/**
 * The pins for an event row as the database handed it over.
 *
 * A row carrying no `pinned_fields` key at all came from a database where the column does
 * not exist — the window between this code deploying and migration 0006 running — and
 * must keep showing what the badge card showed before pins existed. An empty array is a
 * different thing entirely: it is an admin who unpinned everything, and it is obeyed.
 */
export function hydratePins(row: { pinned_fields?: unknown }): PinnedField[] {
  if (!("pinned_fields" in row)) return [{ key: "table_no" }];
  return parsePinnedFields(row.pinned_fields);
}
