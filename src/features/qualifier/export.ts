// The leaderboard as a CSV (D775, D797). Pure, so it is tested without a database; the route adds
// the byte-order mark and the headers. Types only from db.ts (it is server-only).
import type { BoardRow } from "./db";

export const CSV_HEADER = ["Rank", "Name", "Best score", "Runs", "Device", "Flagged"] as const;

/**
 * One CSV field. Quoted when it holds a comma, a quote or a line break, with quotes doubled.
 * A value a spreadsheet would run as a formula (it starts with = + - @, a tab or a return) is
 * made text with a leading apostrophe: names come from a registration form anyone can fill.
 */
function field(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The leaderboard as CSV, CRLF between lines, in rank order. */
export function exportCsv(rows: readonly BoardRow[]): string {
  const line = (cells: (string | number)[]) => cells.map(field).join(",");
  return [CSV_HEADER.join(","), ...rows.map((r) => line([r.rank, r.name, r.best_score, r.runs_played, r.device, r.flagged ? "yes" : ""]))].join("\r\n");
}
