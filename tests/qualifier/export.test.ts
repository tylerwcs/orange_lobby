import { describe, expect, it } from "vitest";
import { exportCsv } from "@/features/qualifier/export";
import type { BoardRow } from "@/features/qualifier/db";

const row = (rank: number, over: Partial<BoardRow> = {}): BoardRow => ({
  rank, attendee_id: `a${rank}`, name: `Person ${rank}`, extra: null, best_score: 1000 - rank,
  best_at: "2026-11-03T10:00:00.000Z", best_run_id: `r${rank}`,
  runs_played: 3, flagged: false, device: "keyboard", ...over,
});
const board = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));
const lines = (csv: string) => csv.split("\r\n");

describe("exportCsv", () => {
  it("starts with the header", () => {
    expect(lines(exportCsv([]))[0]).toBe("Rank,Name,Best score,Runs,Device,Flagged");
  });

  it("writes one line per board row", () => {
    const out = lines(exportCsv([row(1, { flagged: true, device: "touch" })]));
    expect(out[1]).toBe("1,Person 1,999,3,touch,yes");
  });

  it("escapes commas, quotes and newlines in names", () => {
    const rows = [row(1, { name: 'Tan, "TJ" Wei' }), row(2, { name: "Line\nBreak" })];
    const csv = exportCsv(rows);
    expect(csv).toContain('1,"Tan, ""TJ"" Wei",');
    expect(csv).toContain('2,"Line\nBreak",');
  });

  it("keeps non-ASCII names as they are", () => {
    expect(exportCsv([row(1, { name: "Zoë Müller 王" })])).toContain("Zoë Müller 王");
  });

  it("stops a name from running as a spreadsheet formula", () => {
    const csv = exportCsv([row(1, { name: "=HYPERLINK(1)" }), row(2, { name: "+1" }), row(3, { name: "@x" }), row(4, { name: "-x" })]);
    expect(csv).toContain("1,'=HYPERLINK(1),");
    expect(csv).toContain("2,'+1,");
    expect(csv).toContain("3,'@x,");
    expect(csv).toContain("4,'-x,");
  });

  it("writes the whole board in rank order, with no finalist column (D797)", () => {
    const out = lines(exportCsv(board(12))).slice(1);
    expect(out).toHaveLength(12);
    expect(out.every((l, i) => l.startsWith(`${i + 1},Person ${i + 1},`))).toBe(true);
    expect(out.some((l) => /yes$/.test(l))).toBe(false);
  });

  it("marks unflagged runs with an empty Flagged column", () => {
    expect(lines(exportCsv([row(1)]))[1]).toBe("1,Person 1,999,3,keyboard,");
  });
});
