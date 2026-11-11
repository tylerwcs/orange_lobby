import { describe, it, expect } from "vitest";
import { checkPhone, formatNational, joinPhone, PHONE_FORMAT_ERROR, phoneErrorFor, phoneTypingError, pickerTypingError, splitPhone, toE164, toE164My } from "@/lib/phone";

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

describe("toE164 (D897, any country)", () => {
  it("reads Malaysian numbers exactly as toE164My does", () => {
    for (const n of ["012-345 6789", "011-5678 0046", "+60 12-345 6789", "60123456789", "03-1234 5678"]) {
      expect(toE164(n)).toBe(toE164My(n));
    }
  });

  it("takes another country's number given with its + and code", () => {
    expect(toE164("+65 9123 4567")).toBe("6591234567");
    expect(toE164("+62 812-3456-7890")).toBe("6281234567890");
    expect(toE164("+44 7911 123456")).toBe("447911123456");
    expect(toE164("+6591234567")).toBe("6591234567");
  });

  it("refuses bare digits it would have to guess a country for", () => {
    expect(toE164("6591234567")).toBeNull();
    expect(toE164("447911123456")).toBeNull();
  });

  it("refuses a + number that is not real for its country", () => {
    expect(toE164("+65 1234")).toBeNull();
    expect(toE164("+65 1234 5678")).toBeNull();
    expect(toE164("+65 9123 4567 ext 2")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
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
    expect(checkPhone("+44 7911 123456")).toEqual({ ok: true, value: "+447911123456" });
  });

  it("refuses what is not a Malaysian mobile or an international number", () => {
    for (const raw of ["12345", "abc", "03-2345 6789", "+60 3-2345 6789", "0123", "91234567", "+12", "+1234567890123456", "0123456789012"])
      expect(checkPhone(raw), raw).toEqual({ ok: false, error: PHONE_FORMAT_ERROR });
  });
});

describe("phoneTypingError (D676, as you type)", () => {
  it("stays quiet while a number could still become valid", () => {
    for (const t of ["", "0", "01", "012", "012-34", "012 345 678", "0123456789", "011-2345 678", "6", "60", "601", "6012345", "+", "+6", "+60", "+60 12", "+65", "+65 9123", "(012"])
      expect(phoneTypingError(t), t).toBeNull();
  });

  it("flags at once what can never be valid", () => {
    for (const t of ["a", "012a", "03", "03-2345", "+60 3", "0123456789 0", "011234567890", "9", "1234", "+0", "12+3", "+1234567890123456"])
      expect(phoneTypingError(t), t).toBe(PHONE_FORMAT_ERROR);
  });
});

describe("the country picker's helpers (D800)", () => {
  it("splits a saved answer into its country and number", () => {
    expect(splitPhone("012-345 6789")).toEqual({ country: "MY", national: "123456789" });
    expect(splitPhone("+6591234567")).toEqual({ country: "SG", national: "91234567" });
    expect(splitPhone("")).toEqual({ country: "MY", national: "" });
  });

  it("joins them back into what checkPhone reads, dropping a habitual trunk 0", () => {
    expect(joinPhone("MY", "12-345 6789")).toBe("+60123456789");
    expect(joinPhone("MY", "012-345 6789")).toBe("+60123456789");
    expect(joinPhone("SG", "9123 4567")).toBe("+6591234567");
    expect(joinPhone("MY", "")).toBe("");
    expect(checkPhone(joinPhone("MY", "012 345 6789"))).toEqual({ ok: true, value: "012-345 6789" });
    expect(checkPhone(joinPhone("SG", "9123 4567"))).toEqual({ ok: true, value: "+6591234567" });
  });

  it("keeps letters in the joined answer so the check can refuse them", () => {
    expect(checkPhone(joinPhone("MY", "12abc")).ok).toBe(false);
  });

  it("spaces a valid number out the country's way and leaves anything else as typed", () => {
    expect(formatNational("MY", "0123456789")).toBe("12 345 6789");
    expect(formatNational("SG", "91234567")).toBe("9123 4567");
    expect(formatNational("MY", "1234")).toBe("1234");
  });

  it("flags as you type only what more typing cannot fix", () => {
    expect(pickerTypingError("MY", "12")).toBe(false);
    expect(pickerTypingError("MY", "3")).toBe(true); // a landline
    expect(pickerTypingError("SG", "9123")).toBe(false);
    expect(pickerTypingError("SG", "91234567891234567")).toBe(true);
    expect(pickerTypingError("SG", "9x")).toBe(true);
  });

  it("refuses another country's number that is only the right length", () => {
    expect(checkPhone("+65 0000 0000").ok).toBe(false);
  });

  it("names the country in its error", () => {
    expect(phoneErrorFor("MY", "Malaysia")).toBe("Enter a Malaysian mobile number, like 12 345 6789");
    expect(phoneErrorFor("SG", "Singapore")).toContain("Singapore");
  });
});
