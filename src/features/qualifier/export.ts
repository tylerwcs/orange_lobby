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

/** A finalist from the confirmed snapshot, with the name to print. */
export type FinalistRow = Finalist & { name: string };

/**
 * The board as CSV, CRLF between lines. Before the confirm (`finalists` null) it is the live
 * board (`rows`) as it stands, the Finalist column empty.
 *
 * Once confirmed, the finale list is the snapshot, not the live board (D769): a finalist
 * cancelled, moved into a left-out category or deleted after the confirm has left the live
 * board but not the list. So the snapshot comes first, at its own ranks and figures, every line
 * `yes`; Runs, Device and Flagged come from the live board and are empty for a finalist no
 * longer on it. Then everyone else on the live board in live order, numbered on from the
 * snapshot's last rank.
 */
export function exportCsv(rows: readonly BoardRow[], finalists: readonly FinalistRow[] | null): string {
  const line = (cells: (string | number)[]) => cells.map(field).join(",");
  const lines = [CSV_HEADER.join(",")];
  if (finalists === null) {
    for (const r of rows) {
      lines.push(line([r.rank, r.name, r.best_wpm, `${r.best_accuracy}%`, r.runs_played, r.device, r.flagged ? "yes" : "", ""]));
    }
    return lines.join("\r\n");
  }
  const live = new Map(rows.map((r) => [r.attendee_id, r]));
  const ordered = [...finalists].sort((a, b) => a.rank - b.rank);
  for (const f of ordered) {
    const r = live.get(f.attendee_id);
    lines.push(line([
      f.rank, f.name, f.best_wpm, `${f.best_accuracy}%`, r?.runs_played ?? "", r?.device ?? "", r?.flagged ? "yes" : "", "yes",
    ]));
  }
  const through = new Set(ordered.map((f) => f.attendee_id));
  let rank = ordered.reduce((m, f) => Math.max(m, f.rank), 0);
  for (const r of rows) {
    if (through.has(r.attendee_id)) continue;
    rank += 1;
    lines.push(line([rank, r.name, r.best_wpm, `${r.best_accuracy}%`, r.runs_played, r.device, r.flagged ? "yes" : "", ""]));
  }
  return lines.join("\r\n");
}
