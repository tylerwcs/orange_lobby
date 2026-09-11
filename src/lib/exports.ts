import ExcelJS from "exceljs";
import type { Attendee, Checkin, Checkpoint } from "@/lib/types";
import type { AttendeeField } from "@/lib/attendee-fields";

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
 */
export function attendanceExtraColumns(attendees: Pick<Attendee, "extra">[], fields: AttendeeField[]): { key: string; label: string }[] {
  const defined = new Set(fields.map((f) => f.key));
  const seen = Array.from(new Set(attendees.flatMap((a) => Object.keys(a.extra ?? {}))));
  return [...fields.map((f) => ({ key: f.key, label: f.label })), ...seen.filter((k) => !defined.has(k)).map((k) => ({ key: k, label: k }))];
}

export function buildAttendanceWorkbook(attendees: Attendee[], checkpoints: Pick<Checkpoint, "id" | "name">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at" | "scanned_by">[], scannerNames: Record<string, string>, fields: AttendeeField[] = []): ExcelJS.Workbook {
  const extraColumns = attendanceExtraColumns(attendees, fields);
  const byKey = new Map(checkins.map((c) => [`${c.checkpoint_id}:${c.attendee_id}`, c]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  ws.addRow(["Name", "Email", "Phone", "Company", "Category", "Table", "Source", ...extraColumns.map((c) => c.label), ...checkpoints.flatMap((c) => [`${c.name} checked in`, `${c.name} time`, `${c.name} scanned by`])]);
  for (const a of attendees) {
    const row: (string | null)[] = [a.name, a.email, a.phone, a.company, a.category, a.table_no, a.source, ...extraColumns.map((c) => a.extra?.[c.key] ?? "")];
    for (const c of checkpoints) {
      const ci = byKey.get(`${c.id}:${a.id}`);
      row.push(ci ? "Yes" : "No", ci ? new Date(ci.scanned_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "", ci?.scanned_by ? scannerNames[ci.scanned_by] ?? ci.scanned_by : "");
    }
    ws.addRow(row);
  }
  ws.columns?.forEach((c) => { c.width = 20; });
  return wb;
}
