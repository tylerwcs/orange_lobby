import ExcelJS from "exceljs";
import type { Attendee, Checkin, Checkpoint, Booth, BoothStamp } from "@/lib/types";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { SlotRoster } from "@/lib/breakouts";
import { completionByAttendee } from "@/lib/booths";
import { fieldValue } from "@/lib/attendee-values";
import { FORMER_BUILTIN_KEYS } from "@/lib/columns";

const FORMER_BUILTIN_KEY_SET = new Set<string>(FORMER_BUILTIN_KEYS);

export type LinkRow = { name: string; email: string | null; company: string | null; category: string | null; table_no: string | null; link: string };

export function buildLinksWorkbook(rows: LinkRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Links");
  ws.addRow(["Name", "Email", "Company", "Category", "Table", "Link"]);
  for (const r of rows) ws.addRow([r.name, r.email, r.company, r.category, r.table_no, r.link]);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}

/**
 * The extra columns, in the order the sheet should carry them: the event's own defined
 * columns first, under their current labels, then anything else that turned up in
 * `extra` — a header an imported masterlist brought along that nobody declared — under
 * its raw key, so importing a spreadsheet and exporting it again is lossless.
 *
 * Company, phone and table_no are excluded even once they are ordinary fields: the sheet
 * already carries them as fixed columns (via attendeeSheetRow), so leaving them in here
 * would print every value twice.
 */
export function attendanceExtraColumns(attendees: Pick<Attendee, "extra">[], fields: AttendeeField[]): { key: string; label: string }[] {
  const relevant = fields.filter((f) => !FORMER_BUILTIN_KEY_SET.has(f.key));
  const defined = new Set(relevant.map((f) => f.key));
  const seen = Array.from(new Set(attendees.flatMap((a) => Object.keys(a.extra ?? {}))));
  return [...relevant.map((f) => ({ key: f.key, label: f.label })), ...seen.filter((k) => !defined.has(k) && !FORMER_BUILTIN_KEY_SET.has(k)).map((k) => ({ key: k, label: k }))];
}

/**
 * One attendee's row for the Attendance sheet, pulled out so the fixed-column assembly is
 * testable without building a workbook. Phone, Company and Table read through fieldValue so
 * they keep working once the columns they used to be are dropped; `extraColumns` must already
 * have the three legacy keys filtered out (attendanceExtraColumns does that) or a value prints
 * twice.
 */
export function attendeeSheetRow(a: Pick<Attendee, "name" | "email" | "category" | "source" | "extra">, extraColumns: { key: string }[]): unknown[] {
  return [
    a.name, a.email, fieldValue(a, "phone"), fieldValue(a, "company"), a.category, fieldValue(a, "table_no"),
    a.source, ...extraColumns.map((c) => a.extra?.[c.key] ?? ""),
  ];
}

export function buildAttendanceWorkbook(attendees: Attendee[], checkpoints: Pick<Checkpoint, "id" | "name">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at" | "scanned_by">[], scannerNames: Record<string, string>, fields: AttendeeField[] = []): ExcelJS.Workbook {
  const extraColumns = attendanceExtraColumns(attendees, fields);
  const byKey = new Map(checkins.map((c) => [`${c.checkpoint_id}:${c.attendee_id}`, c]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  ws.addRow(["Name", "Email", "Phone", "Company", "Category", "Table", "Source", ...extraColumns.map((c) => c.label), ...checkpoints.flatMap((c) => [`${c.name} checked in`, `${c.name} time`, `${c.name} scanned by`])]);
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

export type RosterPerson = { name: string; company: string | null; email: string | null };

/**
 * A sheet name Excel will actually accept: no : \ / ? * [ ], 31 characters, and unique within
 * the workbook. Two rooms called "3A" in rounds whose names collide after truncation would
 * otherwise make ExcelJS throw at the second one.
 */
export function rosterSheetName(slot: string, code: string, taken: Set<string>): string {
  const clean = (s: string) => s.replace(/[:\\/?*[\]]/g, "-").trim();
  const base = `${clean(slot)} · ${clean(code) || "no code"}`.slice(0, 31);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base.slice(0, 29) + "~~";
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
    ws.addRow(["Name", "Company", "Email"]);
    for (const id of ids) {
      const p = people.get(id);
      if (p) ws.addRow([p.name, p.company, p.email]);
    }
    ws.columns = [{ width: 28 }, { width: 24 }, { width: 28 }];
  };
  for (const s of slots) {
    for (const r of s.rooms) sheet(s.slot, r.code || "no code", r.attendeeIds);
    if (s.unassignedIds.length) sheet(s.slot, "unassigned", s.unassignedIds);
  }
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
  ws.addRow(["Name", "Email", "Company", "Category", ...booths.map((b) => b.name), "Stamps", "Completed"]);
  for (const a of attendees) {
    const c = completion.get(a.id) ?? { collected: 0, complete: false };
    ws.addRow([
      a.name, a.email, fieldValue(a, "company"), a.category,
      ...booths.map((b) => (stamped.has(`${b.id}:${a.id}`) ? "Yes" : "No")),
      c.collected,
      c.complete ? "Yes" : "No",
    ]);
  }
  ws.columns?.forEach((col) => { col.width = 20; });
  return wb;
}
