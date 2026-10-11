import { describe, expect, it } from "vitest";
import { checkMessage, FRIENDLY_REJECTION, MESSAGE_TOO_LONG, normaliseForMatch, hasBlockedWord, messageLength } from "@/features/polaroid/lib/message";

describe("checkMessage (D479)", () => {
  it("passes friendly messages and collapses whitespace", () => {
    expect(checkMessage("  Happy   KOM 2026!\n")).toEqual({ ok: true, message: "Happy KOM 2026!" });
    expect(checkMessage("")).toEqual({ ok: true, message: "" });
    expect(checkMessage("Special thanks to the team")).toEqual({ ok: true, message: "Special thanks to the team" });
  });
  it("rejects English profanity, including leetspeak", () => {
    expect(checkMessage("what the fuck")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("f4ck this")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
  });
  it("rejects Malay and Manglish words, with stretched letters and particles", () => {
    expect(checkMessage("babi")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("Babiii lah")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("b4bilah")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("haram jadah betul")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
  });
  it("rejects the admin's own words", () => {
    expect(checkMessage("Go Rival Co", ["rival co"])).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("Go team", ["rival co"]).ok).toBe(true);
  });
  it("counts characters by code point, at most 80", () => {
    expect(checkMessage("😀".repeat(80)).ok).toBe(true);
    expect(checkMessage("😀".repeat(81))).toEqual({ ok: false, error: MESSAGE_TOO_LONG });
    expect(messageLength("😀a")).toBe(2);
  });
});

describe("normaliseForMatch", () => {
  it("lowercases, undoes leetspeak, strips accents and collapses repeated letters", () => {
    // "!" reads as "i", joins the run of i's, and the run squeezes to one.
    expect(normaliseForMatch("BÁBIIII!!")).toBe("babi");
    expect(normaliseForMatch("k1m4k")).toBe("kimak");
  });
  it("matches whole words only", () => {
    expect(hasBlockedWord("special", ["sial"])).toBe(false);
    expect(hasBlockedWord("sial betul", ["sial"])).toBe(true);
  });
});
