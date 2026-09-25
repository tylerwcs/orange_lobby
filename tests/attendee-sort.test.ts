import { describe, expect, it } from "vitest";
import { compareCells, parseSort, sortRows } from "@/lib/attendee-sort";

describe("compareCells", () => {
  it("compares numbers as numbers, not as text", () => {
    expect(["10", "2", "1"].sort(compareCells)).toEqual(["1", "2", "10"]);
  });

  it("ignores case and accents the way a reader would", () => {
    expect(["bob", "Alice", "ángel"].sort(compareCells)).toEqual(["Alice", "ángel", "bob"]);
  });
});

describe("sortRows", () => {
  const rows = [
    { id: "a", v: "10" }, { id: "b", v: "" }, { id: "c", v: "2" }, { id: "d", v: null }, { id: "e", v: "2" },
  ];
  const valueOf = (r: (typeof rows)[number]) => r.v;

  it("sorts ascending with blanks last, keeping ties in their original order", () => {
    expect(sortRows(rows, valueOf, "asc").map((r) => r.id)).toEqual(["c", "e", "a", "b", "d"]);
  });

  it("sorts descending with blanks still last", () => {
    expect(sortRows(rows, valueOf, "desc").map((r) => r.id)).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("does not touch the list it was given", () => {
    sortRows(rows, valueOf, "desc");
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("parseSort", () => {
  const known = new Set(["name", "category", "room_partner"]);

  it("takes a known column and a direction, defaulting to ascending", () => {
    expect(parseSort("room_partner", "desc", known)).toEqual({ key: "room_partner", dir: "desc" });
    expect(parseSort("category", undefined, known)).toEqual({ key: "category", dir: "asc" });
    expect(parseSort("category", "sideways", known)).toEqual({ key: "category", dir: "asc" });
  });

  it("returns null for no sort or a column that is not on this table", () => {
    expect(parseSort(undefined, "asc", known)).toBeNull();
    expect(parseSort("gone", "asc", known)).toBeNull();
  });
});
