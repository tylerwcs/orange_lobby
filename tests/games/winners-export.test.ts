import { describe, expect, it } from "vitest";
import { buildWinnersWorkbook, winnerSheetRows } from "@/lib/exports";
import type { WinnerRow } from "@/features/games/draw";
import type { Attendee } from "@/lib/types";

type Person = Pick<Attendee, "name" | "email" | "category" | "extra">;

const w = (attendee_id: string, prize_no: number, isVoid = false): WinnerRow =>
  ({ id: attendee_id, event_id: "e1", game_id: "g1", prize_no, attendee_id, drawn_at: "2026-10-01T02:00:00Z", void: isVoid });

describe("winnerSheetRows (D283)", () => {
  const people = new Map<string, Person>([
    ["a1", { name: "Priya Ramasamy", email: "p@x.test", category: "Staff", extra: { company: "Ecopia", nickname: "Pri" } }],
    ["a2", { name: "Tan Mei Ling", email: null, category: null, extra: {} }],
  ]);
  it("has a header and one row per winner, with the prize name and whether they collected", () => {
    const rows = winnerSheetRows([{ name: "Voucher", quantity: 2, image: null }, { name: "iPad", quantity: 1, image: null }], [w("a1", 1), w("a2", 0, true)], people);
    expect(rows[0]).toEqual(["Prize", "Card", "Name", "Company", "Category", "Email", "Drawn at", "Status"]);
    expect(rows[1]).toEqual(["iPad", "", "Priya Ramasamy", "Ecopia", "Staff", "p@x.test", "2026-10-01 10:00", "Won"]);
    expect(rows[2]).toEqual(["Voucher", "", "Tan Mei Ling", "", "", "", "2026-10-01 10:00", "Not here — redrawn"]);
  });
  it("shows a card round's card, and a participant who never picked (D322)", () => {
    const picked: WinnerRow = { ...w("a1", 1), card_no: 3 };
    const pending: WinnerRow = { ...w("a2", 0), prize_no: null, card_no: null };
    const rows = winnerSheetRows([{ name: "Voucher", quantity: 2, image: null }, { name: "iPad", quantity: 1, image: null }], [picked, pending], people);
    expect(rows[1].slice(0, 2)).toEqual(["iPad", "3"]);
    expect(rows[2].slice(0, 2)).toEqual(["No card picked", ""]);
  });
  it("keeps a winner whose attendee was later deleted", () => {
    expect(winnerSheetRows([{ name: "Voucher", quantity: 1, image: null }], [w("gone", 0)], people)[1][2]).toBe("(removed attendee)");
  });
  it("carries the event's chosen export columns after Email, blank for a removed attendee", () => {
    const rows = winnerSheetRows([{ name: "Voucher", quantity: 2, image: null }], [w("a1", 0), w("gone", 0)], people, [{ key: "nickname", label: "Nickname" }]);
    expect(rows[0]).toEqual(["Prize", "Card", "Name", "Company", "Category", "Email", "Nickname", "Drawn at", "Status"]);
    expect(rows[1]).toEqual(["Voucher", "", "Priya Ramasamy", "Ecopia", "Staff", "p@x.test", "Pri", "2026-10-01 10:00", "Won"]);
    expect(rows[2]).toEqual(["Voucher", "", "(removed attendee)", "", "", "", "", "2026-10-01 10:00", "Won"]);
  });
});

describe("buildWinnersWorkbook", () => {
  it("names the sheet after the draw, without the characters Excel refuses", () => {
    const wb = buildWinnersWorkbook("Draw 1/2: the big one", [["Prize"]]);
    expect(wb.worksheets[0].name).toBe("Draw 1-2- the big one");
  });
  it("falls back to Winners for a title with nothing left", () => {
    expect(buildWinnersWorkbook("  ", [["Prize"]]).worksheets[0].name).toBe("Winners");
  });
});
