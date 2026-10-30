import { describe, expect, it } from "vitest";
import { exportCsv } from "@/features/qualifier/export";
import type { BoardRow, Finalist } from "@/features/qualifier/db";

const row = (rank: number, over: Partial<BoardRow> = {}): BoardRow => ({
  rank, attendee_id: `a${rank}`, name: `Person ${rank}`, extra: null, best_wpm: 100 - rank,
  best_accuracy: 97, best_at: "2026-11-03T10:00:00.000Z", best_run_id: `r${rank}`, skin: null,
  runs_played: 3, flagged: false, device: "keyboard", ...over,
});
const board = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));
const finalistsOf = (rows: BoardRow[]): Finalist[] =>
  rows.slice(0, 10).map((r) => ({ rank: r.rank, attendee_id: r.attendee_id, best_wpm: r.best_wpm, best_accuracy: r.best_accuracy, skin: null }));
const lines = (csv: string) => csv.split("\r\n");

describe("exportCsv", () => {
  it("starts with the header", () => {
    expect(lines(exportCsv([], null))[0]).toBe("Rank,Name,Best wpm,Accuracy,Runs,Device,Flagged,Finalist");
  });

  it("writes one line per board row", () => {
    const out = lines(exportCsv([row(1, { flagged: true, device: "touch" })], null));
    expect(out[1]).toBe("1,Person 1,99,97%,3,touch,yes,");
  });

  it("escapes commas, quotes and newlines in names", () => {
    const rows = [row(1, { name: 'Tan, "TJ" Wei' }), row(2, { name: "Line\nBreak" })];
    const csv = exportCsv(rows, null);
    expect(csv).toContain('1,"Tan, ""TJ"" Wei",');
    expect(csv).toContain('2,"Line\nBreak",');
  });

  it("keeps non-ASCII names as they are", () => {
    expect(exportCsv([row(1, { name: "Zoë Müller 王" })], null)).toContain("Zoë Müller 王");
  });

  it("stops a name from running as a spreadsheet formula", () => {
    const csv = exportCsv([row(1, { name: "=HYPERLINK(1)" }), row(2, { name: "+1" }), row(3, { name: "@x" }), row(4, { name: "-x" })], null);
    expect(csv).toContain("1,'=HYPERLINK(1),");
    expect(csv).toContain("2,'+1,");
    expect(csv).toContain("3,'@x,");
    expect(csv).toContain("4,'-x,");
  });

  it("marks exactly the finalists with yes", () => {
    const rows = board(12);
    const out = lines(exportCsv(rows, finalistsOf(rows))).slice(1);
    expect(out.filter((l) => l.endsWith(",yes"))).toHaveLength(10);
    expect(out[9].endsWith(",yes")).toBe(true);
    expect(out[10].endsWith(",")).toBe(true);
    expect(out[11].endsWith(",")).toBe(true);
  });

  it("leaves the Finalist column empty without finalists", () => {
    const out = lines(exportCsv(board(12), null)).slice(1);
    expect(out.some((l) => l.endsWith(",yes"))).toBe(false);
  });

  it("marks unflagged runs with an empty Flagged column", () => {
    expect(lines(exportCsv([row(1)], null))[1]).toBe("1,Person 1,99,97%,3,keyboard,,");
  });
});
