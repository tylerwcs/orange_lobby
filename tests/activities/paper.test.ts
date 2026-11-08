import { describe, it, expect } from "vitest";
import { contrastRatio, hexToRgb } from "@/lib/contrast";
import { PAPER, PAPER_INK, chopInk, paperBackground } from "@/features/activities/kinds/passport/paper";

const stops = () => Object.values(PAPER);
const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a)!, hexToRgb(b)!);

describe("the passport's paper (D854, D856)", () => {
  it("text inks read on every paper stop", () => {
    for (const bg of stops()) {
      for (const k of ["label", "name", "booth", "location"] as const) expect(ratio(PAPER_INK[k], bg), `${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(PAPER_INK.question, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it("chopInk lifts a pale brand to 3:1 ring / 4.5:1 check on cream", () => {
    for (const b of ["#FDE68A", "#ffb066", "#F0C88E", "#418EEF", null]) {
      const ink = chopInk(b);
      for (const bg of stops()) {
        expect(ratio(ink.ring, bg), `${b} ring on ${bg}`).toBeGreaterThanOrEqual(3);
        expect(ratio(ink.check, bg), `${b} check on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("chopInk keeps a brand that already reads", () => expect(chopInk("#005cb9").ring).toBe("#005CB9"));

  it("the texture is faint lines only: no grain", () => {
    const bg = paperBackground();
    expect(bg).toContain("data:image/svg+xml");
    // encodeURIComponent leaves letters alone, so a grain filter would show up as-is. (The whole
    // value cannot be decoded: its "50% 55%" positions are not escapes.)
    expect(bg).not.toContain("feTurbulence");
  });
});
