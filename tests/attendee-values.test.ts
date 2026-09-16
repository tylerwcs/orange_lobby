import { describe, it, expect } from "vitest";
import { fieldValue, LEGACY_COLUMN_KEYS } from "@/lib/attendee-values";

const attendee = (o: Record<string, unknown>) => ({ extra: {}, ...o }) as never;

describe("fieldValue", () => {
  it("reads the value out of extra", () => {
    expect(fieldValue(attendee({ extra: { company: "Ecopia" } }), "company")).toBe("Ecopia");
  });

  it("falls back to the legacy column while extra has no such key", () => {
    expect(fieldValue(attendee({ company: "Ecopia" }), "company")).toBe("Ecopia");
  });

  it("does not resurrect a column when extra holds an empty string", () => {
    // Clearing a value writes "", which is present. The old column must stay buried,
    // or an organiser deleting a company would watch it come back on the next render.
    expect(fieldValue(attendee({ company: "Ecopia", extra: { company: "" } }), "company")).toBe("");
  });

  it("never falls back for a key that was never a column", () => {
    expect(fieldValue(attendee({ shirt_size: "L" }), "shirt_size")).toBe("");
  });

  it("trims what it returns, from either source", () => {
    expect(fieldValue(attendee({ extra: { phone: " 012 " } }), "phone")).toBe("012");
    expect(fieldValue(attendee({ phone: " 012 " }), "phone")).toBe("012");
  });

  it("names exactly the three columns this migration retires", () => {
    expect([...LEGACY_COLUMN_KEYS].sort()).toEqual(["company", "phone", "table_no"]);
  });
});
