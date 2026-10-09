import ExcelJS from "exceljs";
import type { Attendee } from "@/lib/types";
import type { ExportColumn } from "@/lib/export-columns";
import { fieldValue } from "@/lib/attendee-values";
import { columnValues, sanitizeSheetNamePart } from "@/lib/exports";
import { isoToLocalInput } from "@/lib/time";
import type { Prize } from "./config";
import type { WinnerRow } from "./draw";

/**
 * One row per winner, in the order drawn (D283). Voided winners stay, marked, so the sheet is
 * the whole story. The event's chosen export columns follow Email, as on every other export;
 * the route leaves `company` out of them, since Company is already a fixed column here.
 */
export function winnerSheetRows(
  prizes: Prize[], winners: WinnerRow[],
  people: Map<string, Pick<Attendee, "name" | "email" | "category" | "extra">>,
  columns: ExportColumn[] = [],
): string[][] {
  const rows: string[][] = [["Prize", "Card", "Name", "Company", "Category", "Email", ...columns.map((c) => c.label), "Drawn at", "Status"]];
  for (const w of winners) {
    const a = people.get(w.attendee_id);
    rows.push([
      w.prize_no === null ? "No card picked" : prizes[w.prize_no]?.name ?? `Prize ${w.prize_no + 1}`,
      typeof w.card_no === "number" ? String(w.card_no) : "",
      a?.name ?? "(removed attendee)",
      a ? fieldValue(a, "company") : "",
      a?.category ?? "",
      a?.email ?? "",
      ...columnValues(a?.extra, columns),
      isoToLocalInput(w.drawn_at).replace("T", " "),
      w.void ? "Not here — redrawn" : "Won",
    ]);
  }
  return rows;
}

export function buildWinnersWorkbook(title: string, rows: string[][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sanitizeSheetNamePart(title).slice(0, 31) || "Winners");
  for (const r of rows) ws.addRow(r);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}
