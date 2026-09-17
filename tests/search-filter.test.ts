import { describe, it, expect } from "vitest";
import { buildAttendeeSearchFilter, buildNameSearchFilter, isSearchable } from "@/lib/search-filter";

describe("attendee search filter", () => {
  it("strips PostgREST separators from the term", () => {
    expect(buildAttendeeSearchFilter("Tan, Ah Kow")).toBe(
      "name.ilike.%Tan Ah Kow%,email.ilike.%Tan Ah Kow%",
    );
  });
  it("strips parentheses, backslashes and double quotes", () => {
    expect(buildAttendeeSearchFilter(`  A(b)\\c"d  `)).toBe("name.ilike.%Abcd%,email.ilike.%Abcd%");
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
  it("does not reach into extra for company, which is now an ordinary field", () => {
    // Company was the one `extra` key the wide search knew by name. Searching the desk by
    // employer goes with it; no field gets a privileged spot in the filter.
    const filter = buildAttendeeSearchFilter("eco");
    expect(filter).toBe("name.ilike.%eco%,email.ilike.%eco%");
    expect(filter).not.toMatch(/extra/);
  });
  it("leaves the crew-facing name filter exactly as narrow as it was", () => {
    // D98/D99: the booth route is unauthenticated, so its search must not be usable as an
    // inference channel. Widening this is a privacy change, not a refactor.
    expect(buildNameSearchFilter("eco")).toBe("name.ilike.%eco%");
  });
});

describe("booth name-only search filter", () => {
  it("matches only the name", () => {
    expect(buildNameSearchFilter("Kow")).toBe("name.ilike.%Kow%");
  });
  it("strips the same unsafe separators clean() strips", () => {
    expect(buildNameSearchFilter("Tan, Ah Kow")).toBe("name.ilike.%Tan Ah Kow%");
    expect(buildNameSearchFilter(`  A(b)\\c"d  `)).toBe("name.ilike.%Abcd%");
  });
  it("never mentions email or company — a booth's search must not become an inference channel on those fields", () => {
    const filter = buildNameSearchFilter("Petronas");
    expect(filter).not.toMatch(/email/);
    expect(filter).not.toMatch(/company/);
  });
});
