import ExcelJS from "exceljs";
import { slugify } from "@/lib/slug";
import type { Attendee, Checkin, Checkpoint } from "@/lib/types";

export function safeFileName(name: string, id: string): string {
  return `${slugify(name) || "attendee"}-${id.replace(/-/g, "").slice(0, 6)}.png`;
}

export type LinkRow = { name: string; email: string | null; company: string | null; category: string | null; table_no: string | null; seat_no: string | null; link: string };

export function buildLinksWorkbook(rows: LinkRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Links");
  ws.addRow(["Name", "Email", "Company", "Category", "Table", "Seat", "Link"]);
  for (const r of rows) ws.addRow([r.name, r.email, r.company, r.category, r.table_no, r.seat_no, r.link]);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}

export function buildAttendanceWorkbook(attendees: Attendee[], checkpoints: Pick<Checkpoint, "id" | "name">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at" | "scanned_by">[], scannerNames: Record<string, string>): ExcelJS.Workbook {
  const extraKeys = Array.from(new Set(attendees.flatMap((a) => Object.keys(a.extra ?? {}))));
  const byKey = new Map(checkins.map((c) => [`${c.checkpoint_id}:${c.attendee_id}`, c]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  ws.addRow(["Name", "Email", "Phone", "Company", "Category", "Table", "Seat", "Source", ...extraKeys, ...checkpoints.flatMap((c) => [`${c.name} checked in`, `${c.name} time`, `${c.name} scanned by`])]);
  for (const a of attendees) {
    const row: (string | null)[] = [a.name, a.email, a.phone, a.company, a.category, a.table_no, a.seat_no, a.source, ...extraKeys.map((k) => a.extra?.[k] ?? "")];
    for (const c of checkpoints) {
      const ci = byKey.get(`${c.id}:${a.id}`);
      row.push(ci ? "Yes" : "No", ci ? new Date(ci.scanned_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "", ci?.scanned_by ? scannerNames[ci.scanned_by] ?? ci.scanned_by : "");
    }
    ws.addRow(row);
  }
  ws.columns?.forEach((c) => { c.width = 20; });
  return wb;
}
