import ExcelJS from "exceljs";
import type { ExportColumn } from "@/lib/export-columns";
import { columnValues } from "@/lib/exports";
import type { SquadExportRow } from "./lib/squads";
import { formatTime, pointsFor, resolveSport, sportPlaces, tournamentOverall, type SportResults } from "./lib/results";

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

const SCORE_HEADER = ["Sport", "Stage", "Team 1", "Score 1", "Team 2", "Score 2", "Note"];
const TIME_HEADER = ["Sport", "Stage", "Team", "Time", "Place", "Note"];

/**
 * D666: the results workbook's three sheets, as rows. Matches: one row per score match, or one
 * per squad in a race (a time sport's block carries its own header). Places: every settled place
 * with its points. Leaderboard: the overall table, only with a points table - and always, to
 * admins, whatever the reveal switch says.
 */
export function resultSheets(input: { results: SportResults[]; groups: { id: string; name: string }[]; table: number[] | null }): {
  matches: string[][]; places: string[][]; leaderboard: string[][] | null;
} {
  const names = new Map(input.groups.map((g) => [g.id, g.name]));
  const team = (e: { groupId: string | null; pointer: string | null }) => (e.groupId ? names.get(e.groupId) ?? "" : e.pointer ?? "To be picked");
  const matches: string[][] = [];
  const places: string[][] = [["Sport", "Place", "Group", "Points"]];
  let last: "score" | "time" | null = null;
  for (const sr of [...input.results].sort((a, b) => a.sport.position - b.sport.position)) {
    const kind = sr.sport.result_kind;
    if (kind !== last) matches.push(kind === "time" ? TIME_HEADER : SCORE_HEADER);
    last = kind;
    const resolved = resolveSport(sr, names);
    for (const r of resolved) {
      if (kind === "time") {
        const order = r.played ? r.order : [];
        for (const e of r.entries) {
          const value = e.forfeit ? "" : e.dnf ? "DNF" : e.timeMs ? formatTime(e.timeMs) : "";
          const place = e.groupId && order.includes(e.groupId) ? String(order.indexOf(e.groupId) + 1) : "";
          matches.push([sr.sport.name, r.label, team(e), value, place, e.forfeit ? "Forfeit" : ""]);
        }
      } else {
        const [a, b] = r.entries;
        const walk = !!r.note && (r.note.startsWith("Walkover") || r.note === "Both forfeit");
        const score = (e: typeof a | undefined) => (e && !walk && e.score !== null ? String(e.score) : "");
        matches.push([sr.sport.name, r.label, a ? team(a) : "", score(a), b ? team(b) : "", score(b), r.note ?? ""]);
      }
    }
    for (const p of sportPlaces(sr, resolved)) {
      places.push([sr.sport.name, String(p.place), names.get(p.groupId) ?? "", p.forfeit ? "0 (forfeit)" : String(pointsFor(p, input.table))]);
    }
  }
  if (!input.table?.length) return { matches, places, leaderboard: null };
  const sports = [...input.results].sort((a, b) => a.sport.position - b.sport.position);
  const leaderboard = [
    ["Rank", "Group", ...sports.map((r) => r.sport.name), "Total"],
    ...tournamentOverall(sports, input.groups, input.table).map((row) => [
      `${row.rank}${row.tied ? "=" : ""}`, names.get(row.groupId) ?? "",
      ...row.bySport.map((v) => (v === null ? "" : v === "F" ? "0 (forfeit)" : String(v))), String(row.total),
    ]),
  ];
  return { matches, places, leaderboard };
}

export function buildResultsWorkbook(input: Parameters<typeof resultSheets>[0]): ExcelJS.Workbook {
  const sheets = resultSheets(input);
  const wb = new ExcelJS.Workbook();
  const add = (name: string, rows: string[][], widths: number[]) => {
    const ws = wb.addWorksheet(name);
    for (const row of rows) {
      const added = ws.addRow(row);
      if (row === SCORE_HEADER || row === TIME_HEADER || added.number === 1) added.font = { bold: true };
    }
    ws.columns = widths.map((width) => ({ width }));
  };
  add("Matches", sheets.matches.length ? sheets.matches : [SCORE_HEADER, ["No matches yet"]], [16, 22, 22, 10, 22, 10, 28]);
  add("Places", sheets.places, [16, 8, 22, 12]);
  if (sheets.leaderboard) add("Leaderboard", sheets.leaderboard, [8, 22, ...sheets.leaderboard[0].slice(2).map(() => 12)]);
  return wb;
}
