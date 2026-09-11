import ExcelJS from "exceljs";
import type { AttendeeInput } from "@/lib/db/attendees";
import type { AttendeeField } from "@/lib/attendee-fields";

export type MasterlistRow = { row: number } & AttendeeInput & { email: string | null; extra: Record<string, string> };
export type MasterlistResult = { rows: MasterlistRow[]; skipped: { row: number; reason: string }[]; extraColumns: string[] };

const TEMPLATE: Record<string, keyof AttendeeInput> = {
  name: "name", email: "email", phone: "phone", company: "company", category: "category", table: "table_no",
};

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();       // hyperlink / rich text
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);         // formula
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

/**
 * Where each non-template header stores its value. A header that names one of the event's
 * own columns stores under that column's key, so importing "Dietary" fills the Dietary
 * column instead of sitting beside it under a near-identical name. Everything else keeps
 * its own header, which is what makes an unplanned column survive a round trip.
 */
export function extraKeyFor(header: string, fields: AttendeeField[]): string {
  return fields.find((f) => f.label.toLowerCase() === header.toLowerCase())?.key ?? header;
}

export async function parseMasterlist(buffer: ArrayBuffer | Buffer, fields: AttendeeField[] = []): Promise<MasterlistResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs's own (unexported) Buffer type is structurally an ArrayBuffer and doesn't
  // match Node's Buffer from newer @types/node, even though this is exactly what it expects at runtime.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets");
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = cellText(c.value); });
  const lower = headers.map((h) => h.toLowerCase());
  if (!lower.includes("name")) throw new Error('Header row must contain a "Name" column');
  const extraColumns = headers.filter((h) => h && !(h.toLowerCase() in TEMPLATE));

  const rows: MasterlistRow[] = [];
  const skipped: MasterlistResult["skipped"] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) values[h] = cellText(row.getCell(i + 1).value); });
    if (Object.values(values).every((v) => v === "")) continue;
    const name = values[headers[lower.indexOf("name")]] ?? "";
    if (!name) { skipped.push({ row: r, reason: "Name is blank" }); continue; }
    const pick = (key: string) => { const i = lower.indexOf(key); return i >= 0 && values[headers[i]] ? values[headers[i]] : null; };
    const extra: Record<string, string> = {};
    for (const h of extraColumns) extra[extraKeyFor(h, fields)] = values[h] ?? "";
    rows.push({
      row: r, name, email: pick("email")?.toLowerCase() ?? null, phone: pick("phone"), company: pick("company"),
      category: pick("category"), table_no: pick("table"), extra,
    });
  }
  return { rows, skipped, extraColumns };
}
