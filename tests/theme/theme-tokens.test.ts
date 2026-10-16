import { describe, it, expect } from "vitest";
import { brandStyle } from "@/lib/brand";
import { contrastRatio, hexToRgb, toHex, type Rgb } from "@/lib/contrast";
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

  it("the bar carries its own text colour: the ground's, not the card's (white cards on navy)", () => {
    const { tokens: t } = themeTokens({ ...UOB, overrides: { card: "#ffffff", muted_text: "#e5efff" }, heading_reach: "titles_and_cards" }, "#005cb9");
    expect(t["--bar-foreground"]).toBe(t["--foreground"]);
    expect(r(t["--bar-foreground"], t["--bar"])).toBeGreaterThanOrEqual(4.5);
    expect(r(t["--card-foreground"], t["--card"])).toBeGreaterThanOrEqual(4.5);
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
    expect(r(t["--primary-foreground"], t["--primary"])).toBeGreaterThanOrEqual(4.5);
  });

  it("mixed polarity never gives up button text on the primary fill", () => {
    for (const p of ["#F97316", "#ffb066"]) {
      const { tokens: t } = themeTokens({ ...EMPTY_THEME, overrides: { card: "#0b1f4b" } }, p);
      expect(r(t["--primary-foreground"], t["--primary"]), p).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("--brand-on-dark reads on the badge's pin tile (the feature panel under a 10% white wash)", () => {
    const tile = (hex: string) => {
      const [R, G, B] = hexToRgb(hex)!;
      return toHex([R, G, B].map((c) => Math.round(c * 0.9 + 255 * 0.1)) as Rgb);
    };
    for (const bg of ["#fef3c7", "#FFFFFF", "#000c36"])
      for (const p of ["#2563eb", "#7c3aed", "#d9b25f"]) {
        const { tokens: t } = themeTokens({ ...EMPTY_THEME, background: bg }, p);
        expect(r(t["--brand-on-dark"], t["--feature"]), `${bg}/${p} on feature`).toBeGreaterThanOrEqual(4.5);
        expect(r(t["--brand-on-dark"], tile(t["--feature"])), `${bg}/${p} on tile`).toBeGreaterThanOrEqual(4.5);
      }
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

/** `bg-x/NN` over a surface, flattened as the browser composites it (sRGB). */
const over = (fg: string, alpha: number, surface: string) => {
  const [a, b] = [hexToRgb(fg)!, hexToRgb(surface)!];
  return toHex(a.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha))) as Rgb);
};
const UOB_REAL = { ...EMPTY_THEME, background: "#000c36", overrides: { heading: "#ffffff" } };
const DARK_CASES: [string, typeof EMPTY_THEME, string][] = [
  ["uobih2", UOB_REAL, "#005cb9"],
  ["black", { ...EMPTY_THEME, background: "#000000" }, "#005cb9"],
  ["black/gold", { ...EMPTY_THEME, background: "#000000" }, "#d9b25f"],
];

describe("off-card readers get tokens for their own surface (final review 1)", () => {
  it("the badge check-in pill and the passport complete pill read on the feature panel", () => {
    for (const [name, theme, p] of DARK_CASES) {
      const { tokens: t } = themeTokens(theme, p);
      // BadgeCard: text-feature-success on bg-success/25 over --feature (--success is never re-drawn).
      expect(r(t["--feature-success"], over("#16A34A", 0.25, t["--feature"])), `${name} check-in pill`).toBeGreaterThanOrEqual(4.5);
      // PassportGrid: text-feature-accent on bg-brand/25 over --feature.
      expect(r(t["--feature-accent"], over(t["--brand"], 0.25, t["--feature"])), `${name} passport pill`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("an untouched event emits neither, so globals.css's defaults (today's colours) apply", () => {
    const { tokens: t } = themeTokens(EMPTY_THEME, "#005cb9");
    expect(t["--feature-success"]).toBeUndefined();
    expect(t["--feature-accent"]).toBeUndefined();
  });

  it("--destructive is re-drawn on dark themes: text on ground, card and its own tints, fill under its text", () => {
    for (const [name, theme, p] of DARK_CASES) {
      const { tokens: t } = themeTokens(theme, p);
      const d = t["--destructive"];
      expect(d, name).toBeDefined();
      for (const g of ["--background", "--card"]) expect(r(d, t[g]), `${name} destructive on ${g}`).toBeGreaterThanOrEqual(4.5);
      // ghost button / badge: text-destructive on bg-destructive/10 and its /20 hover, over the card
      for (const a of [0.1, 0.2]) expect(r(d, over(d, a, t["--card"])), `${name} on destructive/${a}`).toBeGreaterThanOrEqual(4.5);
      // the destructive alert's description is text-destructive/90 on the card
      expect(r(over(d, 0.9, t["--card"]), t["--card"]), `${name} destructive/90`).toBeGreaterThanOrEqual(4.5);
      // CancelSection / EntryActions: bg-destructive text-destructive-foreground
      expect(r(t["--destructive-foreground"], d), `${name} destructive-foreground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the error toast's fill is never re-drawn by the theme", () => {
    for (const [, theme, p] of DARK_CASES) expect(themeTokens(theme, p).tokens["--toast-error"]).toBeUndefined();
  });
});

describe("color-scheme follows the card (final review 1 ruling)", () => {
  it("a white card on navy is a light scheme; a dark card on the default ground is a dark one", () => {
    expect(themeTokens({ ...UOB, overrides: { card: "#ffffff" } }, "#005cb9").dark).toBe(false);
    expect(themeTokens({ ...EMPTY_THEME, overrides: { card: "#0b1f4b" } }, "#005cb9").dark).toBe(true);
    expect(themeTokens(UOB_REAL, "#005cb9").dark).toBe(true);
    expect(themeTokens(EMPTY_THEME, "#005cb9").dark).toBe(false);
  });
});

describe("overrides on the default ground (no background)", () => {
  // globals.css's values for the tokens an overrides-only theme leaves alone.
  const DEFAULTS: Record<string, string> = {
    "--background": "#F5F5F3", "--foreground": "#111827", "--card": "#FFFFFF", "--card-foreground": "#111827",
    "--muted": "#F1F2F4", "--secondary": "#F1F2F4", "--secondary-foreground": "#111827", "--muted-foreground": "#4B5563",
  };
  const shipped = (t: Record<string, string>) => ({ ...DEFAULTS, ...t });

  it("card, text and secondary-text overrides ship readable pairs and never the bar or the ground", () => {
    for (const overrides of [
      { card: "#fff8e1", text: "#1e3a8a", muted_text: "#64748b" },
      { card: "#fff8e1" },
      { text: "#f0f0f0", muted_text: "#e5e7eb" },
    ]) {
      const { tokens } = themeTokens({ ...EMPTY_THEME, overrides }, "#005cb9");
      expect(tokens["--bar"], JSON.stringify(overrides)).toBeUndefined();
      expect(tokens["--background"], JSON.stringify(overrides)).toBeUndefined();
      const t = shipped(tokens);
      for (const [fg, g] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--muted-foreground", "--card"], ["--muted-foreground", "--background"], ["--muted-foreground", "--muted"], ["--secondary-foreground", "--secondary"], ["--primary", "--card"], ["--primary-foreground", "--primary"]])
        expect(r(t[fg], t[g]), `${JSON.stringify(overrides)} ${fg} on ${g}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a dark card on the default ground (mixed polarity) keeps text and buttons readable, and draws dark status", () => {
    const { tokens } = themeTokens({ ...EMPTY_THEME, overrides: { card: "#0b1f4b" } }, "#005cb9");
    expect(tokens["--bar"]).toBeUndefined();
    const t = shipped(tokens);
    for (const [fg, g] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--secondary-foreground", "--secondary"], ["--primary-foreground", "--primary"], ["--success-strong", "--success-soft"]])
      expect(r(t[fg], t[g]), `${fg} on ${g}`).toBeGreaterThanOrEqual(4.5);
  });

  it("a picked card is what ships", () => {
    expect(themeTokens({ ...EMPTY_THEME, overrides: { card: "#fff8e1" } }, null).tokens["--card"]).toBe("#FFF8E1");
  });
});

describe("secondary text with mixed polarity (white cards on navy)", () => {
  it("keeps the organiser's light colour on the page and gives cards a readable one", () => {
    const { tokens: t } = themeTokens({ ...UOB, overrides: { card: "#ffffff", muted_text: "#e5efff" } }, "#005cb9");
    expect(t["--muted-foreground"]).toBe("#E5EFFF");
    expect(r(t["--muted-foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5);
    expect(r(t["--card-muted-foreground"], t["--card"])).toBeGreaterThanOrEqual(4.5);
    expect(r(t["--card-muted-foreground"], t["--muted"])).toBeGreaterThanOrEqual(4.5);
  });

  it("uses one colour for both when card and page are on the same side", () => {
    const { tokens: t } = themeTokens(UOB, "#d9b25f");
    expect(t["--card-muted-foreground"]).toBe(t["--muted-foreground"]);
  });
});
