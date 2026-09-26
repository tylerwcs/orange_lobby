import ExcelJS from "exceljs";
import type { AttendeeInput } from "@/lib/db/attendees";
import { fieldKey, isReservedFieldKey, keyMatchesField, type AttendeeField } from "@/lib/attendee-fields";

export type MasterlistRow = { row: number } & AttendeeInput & { email: string | null; extra: Record<string, string> };
export type MasterlistResult = { rows: MasterlistRow[]; skipped: { row: number; reason: string }[]; extraColumns: string[] };

/**
 * Headers that name the attendee row itself. Mobile, Company and Table are not here any
 * more: they are fields, so they take the same path as Dietary — matched to one of the
 * event's own columns by extraKeyFor, and stored in `extra`.
 */
const TEMPLATE: Record<string, keyof AttendeeInput> = {
  name: "name", email: "email", category: "category",
};

/**
 * The spellings a spreadsheet uses for the fields that used to be columns. An event that has
 * defined them under its own labels is matched by extraKeyFor first; this is the fallback
 * that keeps a client's existing template importing without being re-labelled.
 *
 * Company is deliberately absent. An event that collects it defines it, and the label match
 * finds it; an event that does not should get "Company" stored under its own header and
 * offered in the "add a column" suggestions, exactly like Seat or Dietary. Reserving the key
 * for a fact the event never asked for is the privilege company no longer has.
 */
const LEGACY_HEADERS: Record<string, string> = {
  mobile: "phone", phone: "phone", table: "table_no", "table no": "table_no",
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
 * own columns — by label, or by the key that label would make — stores under that column's
 * key, so importing "Dietary" fills the Dietary column instead of sitting beside it under a
 * near-identical name. Everything else keeps its own header, which is what makes an
 * unplanned column survive a round trip.
 */
export function extraKeyFor(header: string, fields: AttendeeField[]): string {
  return fields.find((f) => keyMatchesField(header, f))?.key ?? header;
}

/**
 * extraKeyFor, plus the legacy spellings for a header no column of the event's claims. A
 * Phone or Mobile header goes to the event's own phone column whatever it is labelled —
 * that column is the one a WhatsApp send reads, and a second phone column beside it would
 * leave it empty.
 */
function storageKey(header: string, fields: AttendeeField[]): string {
  if (fields.some((f) => keyMatchesField(header, f))) return extraKeyFor(header, fields);
  const legacy = LEGACY_HEADERS[header.toLowerCase()];
  if (legacy === "phone") return fields.find((f) => f.type === "phone")?.key ?? legacy;
  return legacy ?? header;
}

/**
 * The columns an import adds to the table: one for every header no existing column claims.
 *
 * Each is keyed where parseMasterlist already stored its values — the header verbatim, or a
 * legacy key — so the column arrives filled without moving anything. That matters most for a
 * breakout round imported before the agenda exists: room assignment reads the round's values
 * from under its own name, and a column keyed anywhere else would strand them.
 *
 * `skip` names headers that are columns already under another guise — the agenda's breakout
 * rounds, which the table shows as round columns of their own.
 */
export function importedColumns(headers: string[], fields: AttendeeField[], skip: string[] = []): AttendeeField[] {
  const skipped = new Set(skip.map((s) => s.toLowerCase()));
  const out: AttendeeField[] = [];
  for (const header of headers) {
    if (!header || header.toLowerCase() in TEMPLATE || skipped.has(header.toLowerCase())) continue;
    if (isReservedFieldKey(fieldKey(header))) continue;
    const key = storageKey(header, fields);
    if (fields.some((f) => f.key === key)) continue;
    if (out.some((f) => f.key === key || f.label.toLowerCase() === header.toLowerCase())) continue;
    out.push({ key, label: header.slice(0, 40), type: key === "phone" ? "phone" : "text" });
  }
  return out;
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
    for (const h of extraColumns) extra[storageKey(h, fields)] = values[h] ?? "";
    rows.push({ row: r, name, email: pick("email")?.toLowerCase() ?? null, category: pick("category"), extra });
  }
  return { rows, skipped, extraColumns };
}

/** What counts as "joining" in a "Joining X" column. Anything else - 0, blank, "KIV" - is not. */
const JOINS = new Set(["1", "yes", "y", "true"]);

/**
 * The programmes a masterlist row joins, read from its "Joining X" columns ("Joining KOM",
 * "Joining YEP", "Joining Wellness" -> "KOM, YEP, Wellness", in the sheet's column order).
 * Undefined when the sheet has no such columns at all; null when it has them and the person
 * joins none - an answer, not a gap.
 */
export function programmesFromJoining(extra: Record<string, string>): string | null | undefined {
  const joining = Object.entries(extra).flatMap(([key, value]) => {
    const m = /^joining\s+(.+)$/i.exec(key.trim());
    return m ? [{ programme: m[1].trim(), joins: JOINS.has(value.trim().toLowerCase()) }] : [];
  });
  if (joining.length === 0) return undefined;
  const joined = joining.filter((j) => j.joins).map((j) => j.programme);
  return joined.length ? joined.join(", ") : null;
}

/**
 * The category an imported row ends up with. The sheet's own Category cell wins when it says
 * something; otherwise the "Joining X" columns decide (programmesFromJoining); otherwise the
 * attendee keeps the category they already have. A blank cell used to wipe it - so re-importing
 * a sheet with no Category column quietly took every attendee off every programme's content.
 */
export function importedCategory(sheetCategory: string | null, extra: Record<string, string>, existing: string | null): string | null {
  const own = sheetCategory?.trim();
  if (own) return own;
  const joined = programmesFromJoining(extra);
  return joined === undefined ? existing : joined;
}
