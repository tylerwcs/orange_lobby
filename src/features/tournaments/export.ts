import ExcelJS from "exceljs";
import type { ExportColumn } from "@/lib/export-columns";
import { columnValues } from "@/lib/exports";
import type { SquadExportRow } from "./lib/squads";

type Person = { name: string; email: string | null; extra?: Record<string, string> | null };

/**
 * D649: the squads sheet's rows - Sport, Group, Name, the event's chosen export columns, then
 * State, which is blank on a player and Short or Forfeit on the blank row a short squad gets.
 * An empty tournament says so, rather than handing over a sheet that reads as a broken download.
 */
export function squadSheetRows(rows: SquadExportRow[], people: Map<string, Person>, columns: ExportColumn[] = []): string[][] {
  const header = ["Sport", "Group", "Name", ...columns.map((c) => c.label), "State"];
  if (rows.length === 0) return [header, ["No squads yet", ...header.slice(1).map(() => "")]];
  return [header, ...rows.map((r) => {
    const p = r.attendeeId ? people.get(r.attendeeId) : undefined;
    return [r.sport, r.group, p?.name ?? "", ...(p ? columnValues(p.extra, columns) : columns.map(() => "")), r.state];
  })];
}

export function buildSquadsWorkbook(rows: SquadExportRow[], people: Map<string, Person>, columns: ExportColumn[] = []): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Squads");
  for (const row of squadSheetRows(rows, people, columns)) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  ws.columns = [{ width: 18 }, { width: 18 }, { width: 28 }, ...columns.map(() => ({ width: 20 })), { width: 10 }];
  return wb;
}
