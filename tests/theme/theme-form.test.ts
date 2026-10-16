import { describe, it, expect } from "vitest";
import { themeFromForm } from "@/features/theme/lib/form";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("themeFromForm", () => {
  it("reads set colours, treats blanks as worked out", () => {
    expect(themeFromForm(fd({ theme_background: "#000C36", theme_card: "", theme_heading: "#D9B25F", theme_heading_reach: "titles_and_cards" })))
      .toEqual({ background: "#000c36", overrides: { heading: "#d9b25f" }, heading_reach: "titles_and_cards" });
  });
  it("stores the default background as unset, and ignores junk", () => {
    expect(themeFromForm(fd({ theme_background: "#f5f5f3", theme_text: "red", theme_heading_reach: "x" })))
      .toEqual({ background: null, overrides: {}, heading_reach: "titles" });
  });
});
