import ExcelJS from "exceljs";
import type { Attendee, Checkin, Checkpoint, Booth, BoothStamp } from "@/lib/types";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { SlotRoster } from "@/lib/breakouts";
import { completionByAttendee } from "@/lib/booths";
import { fieldValue } from "@/lib/attendee-values";
import { FORMER_BUILTIN_KEYS } from "@/lib/columns";

const FORMER_BUILTIN_KEY_SET = new Set<string>(FORMER_BUILTIN_KEYS);

export type LinkRow = { name: string; email: string | null; category: string | null; table_no: string | null; link: string };

export function buildLinksWorkbook(rows: LinkRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Links");
  ws.addRow(["Name", "Email", "Category", "Table", "Link"]);
  for (const r of rows) ws.addRow([r.name, r.email, r.category, r.table_no, r.link]);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}

/**
 * The extra columns, in the order the sheet should carry them: the event's own defined
 * columns first, under their current labels, then anything else that turned up in
 * `extra` — a header an imported masterlist brought along that nobody declared — under
 * its raw key, so importing a spreadsheet and exporting it again is lossless.
 *
 * Phone and table_no are excluded even once they are ordinary fields: the sheet already
 * carries them as fixed columns (via attendeeSheetRow), so leaving them in here would print
 * every value twice. Company is not excluded — it has no fixed column any more, so this is
 * the only path that can put it on the sheet, and it takes it on the same terms as Dietary
 * or Shirt Size.
 */
export function attendanceExtraColumns(attendees: Pick<Attendee, "extra">[], fields: AttendeeField[]): { key: string; label: string }[] {
  const relevant = fields.filter((f) => !FORMER_BUILTIN_KEY_SET.has(f.key));
  const defined = new Set(relevant.map((f) => f.key));
  const seen = Array.from(new Set(attendees.flatMap((a) => Object.keys(a.extra ?? {}))));
  return [...relevant.map((f) => ({ key: f.key, label: f.label })), ...seen.filter((k) => !defined.has(k) && !FORMER_BUILTIN_KEY_SET.has(k)).map((k) => ({ key: k, label: k }))];
}

/**
 * One attendee's row for the Attendance sheet, pulled out so the fixed-column assembly is
 * testable without building a workbook. Phone and Table read through fieldValue so they keep
 * working once the columns they used to be are dropped; `extraColumns` must already have
 * those two keys filtered out (attendanceExtraColumns does that) or a value prints twice.
 */
export function attendeeSheetRow(a: Pick<Attendee, "name" | "email" | "category" | "source" | "extra">, extraColumns: { key: string }[]): unknown[] {
  return [
    a.name, a.email, fieldValue(a, "phone"), a.category, fieldValue(a, "table_no"),
    a.source, ...extraColumns.map((c) => a.extra?.[c.key] ?? ""),
  ];
}

export function buildAttendanceWorkbook(attendees: Attendee[], checkpoints: Pick<Checkpoint, "id" | "name">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at" | "scanned_by">[], scannerNames: Record<string, string>, fields: AttendeeField[] = []): ExcelJS.Workbook {
  const extraColumns = attendanceExtraColumns(attendees, fields);
  const byKey = new Map(checkins.map((c) => [`${c.checkpoint_id}:${c.attendee_id}`, c]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  ws.addRow(["Name", "Email", "Phone", "Category", "Table", "Source", ...extraColumns.map((c) => c.label), ...checkpoints.flatMap((c) => [`${c.name} checked in`, `${c.name} time`, `${c.name} scanned by`])]);
  for (const a of attendees) {
    const row = attendeeSheetRow(a, extraColumns);
    for (const c of checkpoints) {
      const ci = byKey.get(`${c.id}:${a.id}`);
      row.push(ci ? "Yes" : "No", ci ? new Date(ci.scanned_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "", ci?.scanned_by ? scannerNames[ci.scanned_by] ?? ci.scanned_by : "");
    }
    ws.addRow(row);
  }
  ws.columns?.forEach((c) => { c.width = 20; });
  return wb;
}

export type RosterPerson = { name: string; email: string | null };

/** Strips every character Excel forbids in a sheet name: `: \ / ? * [ ]`. */
export function sanitizeSheetNamePart(s: string): string {
  return s.replace(/[:\\/?*[\]]/g, "-").trim();
}

/**
 * Truncates an already-sanitised sheet name to Excel's 31-character cap and makes it unique
 * against `taken`. Shared by every export that builds one sheet per room/session/etc., so a
 * name collision after truncation (two long titles that agree on their first 31 characters)
 * cannot silently make ExcelJS throw at the second `addWorksheet` — or, worse, silently drop
 * a sheet by both call sites picking the same fallback independently.
 */
export function uniqueSheetName(base: string, taken: Set<string>): string {
  const truncated = base.slice(0, 31);
  if (!taken.has(truncated)) return truncated;
  for (let n = 2; n < 100; n++) {
    const candidate = `${truncated.slice(0, 31 - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return truncated.slice(0, 29) + "~~";
}

/**
 * A sheet name Excel will actually accept: no : \ / ? * [ ], 31 characters, and unique within
 * the workbook. Two rooms called "3A" in rounds whose names collide after truncation would
 * otherwise make ExcelJS throw at the second one.
 */
export function rosterSheetName(slot: string, code: string, taken: Set<string>): string {
  const base = `${sanitizeSheetNamePart(slot)} · ${sanitizeSheetNamePart(code) || "no code"}`;
  return uniqueSheetName(base, taken);
}

/** The title for one activity session's sheet: "<activity> — <session>", sanitised and unique. */
export function activitySheetName(activityName: string, sessionTitle: string, taken: Set<string>): string {
  return uniqueSheetName(`${sanitizeSheetNamePart(activityName)} — ${sanitizeSheetNamePart(sessionTitle)}`, taken);
}

/** The title for an activity's "who has not booked" sheet. */
export function activityUnbookedSheetName(activityName: string, taken: Set<string>): string {
  return uniqueSheetName(`${sanitizeSheetNamePart(activityName)} — Not booked`, taken);
}

/**
 * One printable sheet per room, plus one per round listing whoever has no room.
 *
 * Per room rather than one grid, because the artefact a facilitator asks for is the page for
 * their own room. The cross-tab of everyone against every round is the file the client sent
 * you in the first place.
 *
 * Each room's `attendeeIds` already arrives sorted alphabetically by `rosters` (it sorts into
 * the order of the `attendeeIds` it was given, which `listAttendees` orders by name) — rows are
 * written in that order as-is, with no re-sort here.
 */
export function buildRosterWorkbook(slots: SlotRoster[], people: Map<string, RosterPerson>): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  const sheet = (slot: string, code: string, ids: string[]) => {
    const name = rosterSheetName(slot, code, taken);
    taken.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(["Name", "Email"]);
    for (const id of ids) {
      const p = people.get(id);
      if (p) ws.addRow([p.name, p.email]);
    }
    ws.columns = [{ width: 28 }, { width: 28 }];
  };
  for (const s of slots) {
    for (const r of s.rooms) sheet(s.slot, r.code || "no code", r.attendeeIds);
    if (s.unassignedIds.length) sheet(s.slot, "unassigned", s.unassignedIds);
  }
  return wb;
}

export type ActivitySessionRoster = { activityName: string; sessionTitle: string; attendeeIds: string[] };
export type ActivityUnbookedRoster = { activityName: string; attendeeIds: string[] };

/**
 * The door list: one printable sheet per session, titled "<activity> — <session>", plus one
 * sheet per required activity listing whoever is eligible and has booked nothing.
 *
 * Same shape as `buildRosterWorkbook` on purpose — one sheet per bookable unit plus a sheet for
 * whoever has none — and it reuses the same "Name"/"Email" columns a printed roster carries.
 * `attendeeIds` on both inputs must already be in the order the caller wants printed (the
 * route sorts into `listAttendees` order); this only writes rows.
 *
 * A session with no bookings still gets its sheet, header and all: an empty room is
 * information the door list has to state, not a row this function is entitled to skip.
 */
export function buildActivityRostersWorkbook(
  sessions: ActivitySessionRoster[],
  unbooked: ActivityUnbookedRoster[],
  people: Map<string, RosterPerson>,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  const sheet = (name: string, ids: string[]) => {
    taken.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(["Name", "Email"]);
    for (const id of ids) {
      const p = people.get(id);
      if (p) ws.addRow([p.name, p.email]);
    }
    ws.columns = [{ width: 28 }, { width: 28 }];
  };
  for (const s of sessions) sheet(activitySheetName(s.activityName, s.sessionTitle, taken), s.attendeeIds);
  for (const u of unbooked) sheet(activityUnbookedSheetName(u.activityName, taken), u.attendeeIds);
  return wb;
}

/**
 * The passport, as its own sheet (D100).
 *
 * Deliberately not folded into the attendance workbook: five booths there would add fifteen
 * columns to a file that answers a different question, and a booth visit is not attendance.
 * One row per attendee, one column per booth, then the two numbers anyone actually reads —
 * how many stamps, and whether the card is full.
 */
export function buildPassportWorkbook(attendees: Attendee[], booths: Booth[], stamps: BoothStamp[], required: number | null): ExcelJS.Workbook {
  const completion = completionByAttendee(booths, stamps, required);
  const stamped = new Set(stamps.map((s) => `${s.booth_id}:${s.attendee_id}`));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Booth Passport");
  ws.addRow(["Name", "Email", "Category", ...booths.map((b) => b.name), "Stamps", "Completed"]);
  for (const a of attendees) {
    const c = completion.get(a.id) ?? { collected: 0, complete: false };
    ws.addRow([
      a.name, a.email, a.category,
      ...booths.map((b) => (stamped.has(`${b.id}:${a.id}`) ? "Yes" : "No")),
      c.collected,
      c.complete ? "Yes" : "No",
    ]);
  }
  ws.columns?.forEach((col) => { col.width = 20; });
  return wb;
}
