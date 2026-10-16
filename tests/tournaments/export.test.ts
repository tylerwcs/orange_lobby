import { describe, expect, it } from "vitest";
import { buildSquadsWorkbook, squadSheetRows } from "@/features/tournaments/export";

const people = new Map([["a", { name: "Aina", email: "aina@x.co", extra: { master_no: "M-001" } }]]);
const columns = [{ key: "master_no", label: "Master No" }];
const rows = [
  { sport: "Badminton", group: "Group 01", attendeeId: "a", state: "" as const },
  { sport: "Badminton", group: "Group 02", attendeeId: null, state: "Short" as const },
];

describe("squadSheetRows (D649)", () => {
  it("writes Sport, Group, Name, the chosen columns and State, with a blank name on a short squad", () => {
    expect(squadSheetRows(rows, people, columns)).toEqual([
      ["Sport", "Group", "Name", "Master No", "State"],
      ["Badminton", "Group 01", "Aina", "M-001", ""],
      ["Badminton", "Group 02", "", "", "Short"],
    ]);
  });
  it("says so when there are no squads at all", () => {
    expect(squadSheetRows([], people, [])).toEqual([["Sport", "Group", "Name", "State"], ["No squads yet", "", "", ""]]);
  });
});

describe("buildSquadsWorkbook", () => {
  it("puts the rows on one Squads sheet", () => {
    const ws = buildSquadsWorkbook(rows, people, columns).getWorksheet("Squads");
    expect(ws?.getRow(1).values).toEqual([undefined, "Sport", "Group", "Name", "Master No", "State"]);
    expect(ws?.getRow(3).values).toEqual([undefined, "Badminton", "Group 02", "", "", "Short"]);
  });
});
