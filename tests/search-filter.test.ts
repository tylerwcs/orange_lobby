import { describe, it, expect } from "vitest";
import { buildAttendeeSearchFilter, isSearchable } from "@/lib/search-filter";

describe("attendee search filter", () => {
  it("strips PostgREST separators from the term", () => {
    expect(buildAttendeeSearchFilter("Tan, Ah Kow")).toBe(
      "name.ilike.%Tan Ah Kow%,email.ilike.%Tan Ah Kow%,company.ilike.%Tan Ah Kow%",
    );
  });
  it("strips parentheses, backslashes and double quotes", () => {
    expect(buildAttendeeSearchFilter(`  A(b)\\c"d  `)).toBe("name.ilike.%Abcd%,email.ilike.%Abcd%,company.ilike.%Abcd%");
  });
  it("strips wildcards so a bare % is not searchable", () => {
    expect(isSearchable("%")).toBe(false);
    expect(isSearchable("   ")).toBe(false);
    expect(isSearchable(",()")).toBe(false);
  });
  it("is searchable once at least one character survives cleaning", () => {
    expect(isSearchable("a")).toBe(true);
    expect(isSearchable("%a%")).toBe(true);
  });
});
