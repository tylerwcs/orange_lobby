// The ranked list as a CSV (D775). Pure, so it is tested without a database; the route adds
// the byte-order mark and the headers. Types only from db.ts (it is server-only).
import type { BoardRow, Finalist } from "./db";

export const CSV_HEADER = ["Rank", "Name", "Best wpm", "Accuracy", "Runs", "Device", "Flagged", "Finalist"] as const;

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

/**
 * The board rows as CSV, CRLF between lines. `Finalist` is `yes` for the people in the
 * confirmed list and empty for everyone else, and for every row before the confirm
 * (`finalists` null).
 */
export function exportCsv(rows: readonly BoardRow[], finalists: readonly Finalist[] | null): string {
  const through = new Set((finalists ?? []).map((f) => f.attendee_id));
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push([
      r.rank, r.name, r.best_wpm, `${r.best_accuracy}%`, r.runs_played, r.device,
      r.flagged ? "yes" : "", through.has(r.attendee_id) ? "yes" : "",
    ].map(field).join(","));
  }
  return lines.join("\r\n");
}
