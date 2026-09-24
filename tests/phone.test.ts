import { describe, it, expect } from "vitest";
import { toE164My } from "@/lib/phone";

describe("toE164My", () => {
  it("normalises the format the masterlist actually uses", () => {
    // Every phone on the KOM event is shaped 01X-XXX XXXX.
    expect(toE164My("012-345 6789")).toBe("60123456789");
  });

  it("handles the longer 011 mobiles, which carry one more digit", () => {
    expect(toE164My("011-5678 0046")).toBe("601156780046");
  });

  it("accepts a number that already carries its country code", () => {
    expect(toE164My("+60 12-345 6789")).toBe("60123456789");
    expect(toE164My("60123456789")).toBe("60123456789");
  });

  it("does not care how a spreadsheet punctuated it", () => {
    expect(toE164My("0123456789")).toBe("60123456789");
    expect(toE164My("  012 345 6789  ")).toBe("60123456789");
    expect(toE164My("012.345.6789")).toBe("60123456789");
  });

  it("keeps landlines, because a wrong number is worse than an undelivered one", () => {
    // Not a mobile, so it will have no WhatsApp account — but that is Meta's answer to
    // give, not ours to guess. Dropping it silently would hide a bad row in the sheet.
    expect(toE164My("03-1234 5678")).toBe("60312345678");
  });

  it("refuses anything it cannot be sure of, rather than inventing a number", () => {
    expect(toE164My("")).toBeNull();
    expect(toE164My("   ")).toBeNull();
    expect(toE164My("n/a")).toBeNull();
    expect(toE164My("12345")).toBeNull();
    expect(toE164My("012-345 67890123")).toBeNull();
    expect(toE164My("+65 9123 4567")).toBeNull();
  });
});
