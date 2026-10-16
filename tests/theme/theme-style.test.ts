import { describe, it, expect } from "vitest";
import { eventThemeCss } from "@/features/theme/client";

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
});
