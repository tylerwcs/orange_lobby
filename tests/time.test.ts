import { describe, it, expect } from "vitest";
import { MY_TZ, isoToLocalInput, localInputToIso } from "@/lib/time";

describe("time", () => {
  it("uses the Malaysian timezone", () => {
    expect(MY_TZ).toBe("Asia/Kuala_Lumpur");
  });
  it("round trips a local datetime-local value through an ISO instant", () => {
    const iso = localInputToIso("2026-09-22T23:59");
    expect(iso).toBe("2026-09-22T23:59:00+08:00");
    expect(isoToLocalInput(iso)).toBe("2026-09-22T23:59");
  });
  it("renders a UTC instant in Kuala Lumpur time", () => {
    expect(isoToLocalInput("2026-09-22T15:59:00Z")).toBe("2026-09-22T23:59");
  });
  it("returns null for blank or malformed input", () => {
    expect(localInputToIso(null)).toBeNull();
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("22/09/2026 23:59")).toBeNull();
    expect(localInputToIso("2026-02-30T10:00")).toBeNull();
  });
  it("returns an empty string for a missing instant", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput("not a date")).toBe("");
  });
});
