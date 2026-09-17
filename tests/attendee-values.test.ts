import { describe, it, expect } from "vitest";
import { fieldValue } from "@/lib/attendee-values";

const attendee = (extra: Record<string, string>) => ({ extra });

describe("fieldValue", () => {
  it("reads the value out of extra", () => {
    expect(fieldValue(attendee({ company: "Ecopia" }), "company")).toBe("Ecopia");
  });

  it("trims what it returns", () => {
    expect(fieldValue(attendee({ phone: " 012 " }), "phone")).toBe("012");
  });

  it("is blank for a key the attendee has no answer for", () => {
    expect(fieldValue(attendee({}), "company")).toBe("");
  });

  it("no longer consults anything but extra", () => {
    // The columns are gone. A property shaped like the old column must not be read —
    // if this ever passes again, the fallback has crept back in.
    expect(fieldValue({ extra: {}, company: "Stale Co" } as never, "company")).toBe("");
  });

  it("tolerates an attendee whose extra is missing entirely", () => {
    expect(fieldValue({} as never, "company")).toBe("");
  });
});
