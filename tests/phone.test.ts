import { describe, it, expect } from "vitest";
import { checkPhone, PHONE_FORMAT_ERROR, toE164My } from "@/lib/phone";

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

describe("checkPhone (D675 registration format)", () => {
  it("takes Malaysian mobiles however they are spaced, and tidies them", () => {
    for (const raw of ["0123456789", "012-345 6789", "012 345 6789", "+60 12-345 6789", "60123456789", "(012) 345-6789"])
      expect(checkPhone(raw), raw).toEqual({ ok: true, value: "012-345 6789" });
    expect(checkPhone("011-2345 6789")).toEqual({ ok: true, value: "011-2345 6789" });
    expect(checkPhone("+601123456789")).toEqual({ ok: true, value: "011-2345 6789" });
  });

  it("takes an international number with + and its country code, kept as digits", () => {
    expect(checkPhone("+65 9123 4567")).toEqual({ ok: true, value: "+6591234567" });
    expect(checkPhone("+44 7700 900123")).toEqual({ ok: true, value: "+447700900123" });
  });

  it("refuses what is not a Malaysian mobile or an international number", () => {
    for (const raw of ["12345", "abc", "03-2345 6789", "+60 3-2345 6789", "0123", "91234567", "+12", "+1234567890123456", "0123456789012"])
      expect(checkPhone(raw), raw).toEqual({ ok: false, error: PHONE_FORMAT_ERROR });
  });
});
