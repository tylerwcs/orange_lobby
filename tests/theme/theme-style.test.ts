import { describe, it, expect } from "vitest";
import { brandStyle } from "@/lib/brand";
import { eventThemeCss, themeCss } from "@/features/theme/client";

describe("eventThemeCss (D625)", () => {
  it("writes a themed event's tokens on :root with the dark colour scheme", () => {
    const css = eventThemeCss({ theme: { background: "#000c36", overrides: {}, heading_reach: "titles" }, primary_color: "#d9b25f" });
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).toContain("--background:#000C36");
    expect(css.endsWith("color-scheme:dark}")).toBe(true);
  });

  it("writes an unthemed event's brand tokens only, on the light scheme", () => {
    const css = eventThemeCss({ theme: undefined, primary_color: null });
    expect(css).toContain("--primary:");
    expect(css).not.toContain("--background");
    expect(css.endsWith("color-scheme:light}")).toBe(true);
  });

  it("an unthemed event's rule is exactly today's brand tokens on the light scheme", () => {
    for (const p of [null, "#005cb9", "#ffb066"]) {
      expect(eventThemeCss({ theme: undefined, primary_color: p })).toBe(themeCss(brandStyle(p), false));
      expect(eventThemeCss({ theme: { background: null, overrides: {}, heading_reach: "titles" }, primary_color: p })).toBe(themeCss(brandStyle(p), false));
    }
  });

  it("a white card on navy writes the light scheme; a dark card on the default ground the dark one", () => {
    expect(eventThemeCss({ theme: { background: "#000c36", overrides: { card: "#ffffff" }, heading_reach: "titles" }, primary_color: "#005cb9" }).endsWith("color-scheme:light}")).toBe(true);
    expect(eventThemeCss({ theme: { background: null, overrides: { card: "#0b1f4b" }, heading_reach: "titles" }, primary_color: "#005cb9" }).endsWith("color-scheme:dark}")).toBe(true);
  });
});
