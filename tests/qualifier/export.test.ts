import { describe, expect, it } from "vitest";
import { exportCsv, type FinalistRow } from "@/features/qualifier/export";
import type { BoardRow } from "@/features/qualifier/db";

const row = (rank: number, over: Partial<BoardRow> = {}): BoardRow => ({
  rank, attendee_id: `a${rank}`, name: `Person ${rank}`, extra: null, best_wpm: 100 - rank,
  best_accuracy: 97, best_at: "2026-11-03T10:00:00.000Z", best_run_id: `r${rank}`, skin: null,
  runs_played: 3, flagged: false, device: "keyboard", ...over,
});
const board = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));
const finalistsOf = (rows: BoardRow[]): FinalistRow[] =>
  rows.slice(0, 10).map((r) => ({ rank: r.rank, attendee_id: r.attendee_id, name: r.name, best_wpm: r.best_wpm, best_accuracy: r.best_accuracy, skin: null }));
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

  it("keeps a finalist who left the live board after the confirm, and no one else moves up", () => {
    const confirmed = board(12);
    const finalists = finalistsOf(confirmed);
    // #3 cancelled after the confirm: off the live board, which re-ranks everyone below.
    const live = confirmed.filter((r) => r.rank !== 3).map((r, i) => ({ ...r, rank: i + 1 }));
    const out = lines(exportCsv(live, finalists)).slice(1);
    expect(out).toHaveLength(12);
    expect(out.filter((l) => l.endsWith(",yes"))).toHaveLength(10);
    // The snapshot's own rank and figures; nothing live to show for runs, device or flags.
    expect(out[2]).toBe("3,Person 3,97,97%,,,,yes");
    expect(out[9]).toBe("10,Person 10,90,97%,3,keyboard,,yes");
    // The live #10 (the old #11) stays below the cut.
    expect(out[10]).toBe("11,Person 11,89,97%,3,keyboard,,");
    expect(out[11]).toBe("12,Person 12,88,97%,3,keyboard,,");
  });

  it("lists the finalists in snapshot order even when the live board has someone new above them", () => {
    const confirmed = board(11);
    const finalists = finalistsOf(confirmed);
    const newcomer = row(0, { attendee_id: "late", name: "Late Comer", best_wpm: 150 });
    const live = [newcomer, ...confirmed].map((r, i) => ({ ...r, rank: i + 1 }));
    const out = lines(exportCsv(live, finalists)).slice(1);
    expect(out.slice(0, 10).every((l, i) => l.startsWith(`${i + 1},Person ${i + 1},`) && l.endsWith(",yes"))).toBe(true);
    expect(out[10]).toBe("11,Late Comer,150,97%,3,keyboard,,");
    expect(out[11]).toBe("12,Person 11,89,97%,3,keyboard,,");
  });

  it("leaves the Finalist column empty without finalists", () => {
    const out = lines(exportCsv(board(12), null)).slice(1);
    expect(out.some((l) => l.endsWith(",yes"))).toBe(false);
  });

  it("marks unflagged runs with an empty Flagged column", () => {
    expect(lines(exportCsv([row(1)], null))[1]).toBe("1,Person 1,99,97%,3,keyboard,,");
  });
});
