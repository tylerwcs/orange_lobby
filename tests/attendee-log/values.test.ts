import { describe, it, expect } from "vitest";
import { attendeeValues, blank, diffValues } from "@/features/attendee-log/lib/values";
import { labels, person } from "./fixtures";

describe("attendee log values", () => {
  it("treats null, undefined and whitespace as blank", () => {
    expect(blank(null)).toBe("");
    expect(blank(undefined)).toBe("");
    expect(blank("  x ")).toBe("x");
    expect(diffValues([{ label: "Phone", value: " " }], [])).toEqual([]);
  });

  it("attendeeValues lists Name, Email, Category, fields, Group, rooms by label", () => {
    const a = person({ id: "a1", category: "VIP", group_id: "g1", extra: { shirt: "L" } });
    const withRooms = { ...labels, roomsOf: new Map([["a1", { "Round 1": "B2" }]]) };
    expect(attendeeValues(a, withRooms)).toEqual([
      { label: "Name", value: "Lee Mei Ling" },
      { label: "Email", value: "mei@example.com" },
      { label: "Category", value: "VIP" },
      { label: "Shirt size", value: "L" },
      { label: "Group", value: "Team A" },
      { label: "Round 1 room", value: "B2" },
    ]);
  });

  it("attendeeValues leaves blanks out", () => {
    const a = person({ id: "a1", email: null });
    expect(attendeeValues(a, labels).map((v) => v.label)).toEqual(["Name"]);
  });

  it("diffValues reports old → new by label", () => {
    expect(diffValues([{ label: "Table", value: "12" }], [{ label: "Table", value: "14" }]))
      .toEqual([{ label: "Table", before: "12", after: "14" }]);
    expect(diffValues([{ label: "Table", value: "12" }], [])).toEqual([{ label: "Table", before: "12", after: "" }]);
    expect(diffValues([], [{ label: "Table", value: "3" }])).toEqual([{ label: "Table", before: "", after: "3" }]);
  });
});
