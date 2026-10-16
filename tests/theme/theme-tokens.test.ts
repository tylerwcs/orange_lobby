import { describe, it, expect } from "vitest";
import { brandStyle } from "@/lib/brand";
import { contrastRatio, hexToRgb } from "@/lib/contrast";
import { EMPTY_THEME, parseTheme, themeTokens, themeCss, workedOut, isDarkGround } from "@/features/theme/client";

const r = (a: string, b: string) => contrastRatio(hexToRgb(a)!, hexToRgb(b)!);
const UOB = { ...EMPTY_THEME, background: "#000c36" };

describe("themeTokens (D622-D632)", () => {
  it("an event with no theme gets exactly today's tokens", () => {
    for (const p of [null, "#F97316", "#ffb066", "#d9b25f"]) {
      expect(themeTokens(EMPTY_THEME, p)).toEqual({ tokens: brandStyle(p), dark: false, adjusted: {} });
    }
  });

  it("decides light or dark from the background (D630)", () => {
    expect(isDarkGround("#000c36")).toBe(true);
    expect(isDarkGround("#fef3c7")).toBe(false);
    expect(themeTokens(UOB, "#d9b25f").dark).toBe(true);
  });

  it("UOB navy + gold gives option A: lighter navy cards, white text, gold that reads", () => {
    const { tokens: t } = themeTokens(UOB, "#d9b25f");
    expect(t["--background"]).toBe("#000C36");
    expect(t["--bar"]).toBe("#000C36");
    expect(t["--foreground"]).toBe("#FFFFFF");
    expect(t["--card"]).not.toBe(t["--background"]);
    expect(r(t["--card"], "#FFFFFF")).toBeLessThan(r("#000c36", "#FFFFFF")); // card lighter than ground
    for (const [fg, bg] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--muted-foreground", "--card"], ["--muted-foreground", "--background"], ["--primary", "--card"], ["--primary-foreground", "--primary"], ["--accent-foreground", "--accent"], ["--brand-on-dark", "--feature"], ["--feature-foreground", "--feature"], ["--success-strong", "--success-soft"], ["--destructive-strong", "--destructive-soft"], ["--gold-strong", "--gold-soft"]])
      expect(r(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(t["--logo-tile"]).toBe("#FFFFFF");
    expect(t["--logo-pad"]).toBe("4px");
  });

  it("every pair reads on extreme and odd grounds", () => {
    for (const bg of ["#000000", "#FFFFFF", "#7f7f7f", "#fef3c7", "#0b1f4b"])
      for (const p of ["#ffd400", "#111111", "#ffffff", "#d9b25f"]) {
        const { tokens: t } = themeTokens({ ...EMPTY_THEME, background: bg }, p);
        expect(t["--card"]).not.toBe(t["--background"]);
        expect(t["--border"]).not.toBe(t["--card"]);
        for (const [fg, g] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--muted-foreground", "--background"], ["--muted-foreground", "--card"], ["--primary", "--card"], ["--primary", "--background"], ["--primary-foreground", "--primary"]])
          expect(r(t[fg], t[g]), `${bg}/${p} ${fg} on ${g}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("a ground just on the dark side, where even white fails 4.5:1, still gets readable text", () => {
    expect(isDarkGround("#7a7a7a")).toBe(true);
    const { tokens: t } = themeTokens({ ...EMPTY_THEME, background: "#7a7a7a" }, "#d9b25f");
    for (const [fg, g] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--muted-foreground", "--background"], ["--primary", "--background"], ["--feature-foreground", "--feature"]])
      expect(r(t[fg], t[g]), `${fg} on ${g}`).toBeGreaterThanOrEqual(4.5);
  });

  it("mixed polarity: a white card on navy keeps both texts readable", () => {
    const { tokens: t } = themeTokens({ ...UOB, overrides: { card: "#ffffff" } }, "#d9b25f");
    expect(r(t["--foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5);
    expect(r(t["--card-foreground"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("an unreadable override is adjusted and flagged, never dropped", () => {
    const out = themeTokens({ ...UOB, overrides: { text: "#0a1440" } }, "#d9b25f");
    expect(out.adjusted.text).toBe(true);
    expect(r(out.tokens["--foreground"], "#000c36")).toBeGreaterThanOrEqual(4.5);
    expect(themeTokens({ ...UOB, overrides: { text: "#ffffff" } }, null).adjusted.text).toBeUndefined();
  });

  it("heading reach (D632) and hue-less headings", () => {
    const titles = themeTokens({ ...UOB, overrides: { heading: "#d9b25f" } }, null).tokens;
    expect(titles["--heading"]).toBeDefined();
    expect(titles["--card-heading"]).toBeUndefined();
    const cards = themeTokens({ ...UOB, overrides: { heading: "#d9b25f" }, heading_reach: "titles_and_cards" }, null).tokens;
    expect(cards["--card-heading"]).toBe(cards["--heading"]);
    // White heading on the default (light) ground falls back to the text ink, not a dull grey.
    expect(themeTokens({ ...EMPTY_THEME, overrides: { heading: "#ffffff" } }, null).tokens["--heading"]).toBe("#111827");
  });

  it("workedOut fills every key, and themeCss writes :root with the colour scheme", () => {
    expect(Object.keys(workedOut("#000c36")).sort()).toEqual(["border", "card", "heading", "muted_text", "text"]);
    const css = themeCss({ "--background": "#000C36" }, true);
    expect(css).toBe(":root{--background:#000C36;color-scheme:dark}");
    expect(themeCss({}, false)).toBe(":root{color-scheme:light}");
  });

  it("parseTheme keeps valid colours and drops the rest", () => {
    expect(parseTheme({ background: "navy", overrides: { card: 123, text: "#FFFFFF" }, heading_reach: "everything" }))
      .toEqual({ background: null, overrides: { text: "#ffffff" }, heading_reach: "titles" });
    expect(parseTheme(null)).toEqual(EMPTY_THEME);
  });
});
