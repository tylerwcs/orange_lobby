import ExcelJS from "exceljs";
import { slugify } from "@/lib/slug";

export function safeFileName(name: string, id: string): string {
  return `${slugify(name) || "attendee"}-${id.replace(/-/g, "").slice(0, 6)}.png`;
}

export type LinkRow = { name: string; email: string | null; company: string | null; category: string | null; table_no: string | null; seat_no: string | null; link: string };

export function buildLinksWorkbook(rows: LinkRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Links");
  ws.addRow(["Name", "Email", "Company", "Category", "Table", "Seat", "Link"]);
  for (const r of rows) ws.addRow([r.name, r.email, r.company, r.category, r.table_no, r.seat_no, undefined, r.link]);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}
