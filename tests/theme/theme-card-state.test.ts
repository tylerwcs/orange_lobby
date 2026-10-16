import { describe, it, expect } from "vitest";
import { EMPTY_THEME, workedOut, type EventTheme } from "@/features/theme/client";
import { themeFromForm } from "@/features/theme/lib/form";
import { adjustedNote, pickerValue, postedValue, primaryNote, reachHint, withOverride, withReach, withStyle, FIELD_NAMES, type ThemeField } from "@/features/theme/admin/card-state";
import { themeTokens } from "@/features/theme/client";

describe("Theme card state (D623, D624, D626)", () => {
  it("posts nothing for an untouched theme, and shows the default ground", () => {
    expect(postedValue(EMPTY_THEME, "background")).toBe("");
    expect(postedValue(EMPTY_THEME, "card")).toBe("");
    expect(pickerValue(EMPTY_THEME, "background")).toBe("#f5f5f3");
  });

  it("re-works the colours that are not overridden from the picked ground", () => {
    const t = withOverride(EMPTY_THEME, "background", "#000c36");
    expect(postedValue(t, "background")).toBe("#000c36");
    expect(pickerValue(t, "card")).toBe(workedOut("#000c36").card.toLowerCase());
  });

  it("shows an override and posts it; Reset clears it", () => {
    const t = withOverride(EMPTY_THEME, "background", "#000c36");
    const carded = withOverride(t, "card", "#FFFFFF");
    expect(pickerValue(carded, "card")).toBe("#ffffff");
    expect(postedValue(carded, "card")).toBe("#ffffff");
    expect(postedValue(withOverride(carded, "card", null), "card")).toBe("");
    expect(postedValue(withOverride(t, "background", null), "background")).toBe("");
  });

  it("says when a picked colour is shown adjusted, and which way", () => {
    const t = withOverride(EMPTY_THEME, "background", "#000c36");
    expect(adjustedNote(withOverride(t, "text", "#0a1440"), "#d9b25f", "text")).toBe("Shown lighter so it can be read");
    expect(adjustedNote(withOverride(EMPTY_THEME, "text", "#f0f0f0"), "#d9b25f", "text")).toBe("Shown darker so it can be read");
    expect(adjustedNote(withOverride(t, "text", "#ffffff"), "#d9b25f", "text")).toBeNull();
    expect(adjustedNote(t, "#d9b25f", "text")).toBeNull();
  });

  it("round-trips a stored theme through the posted fields unchanged", () => {
    const theme: EventTheme = { background: "#000c36", overrides: { card: "#0f1d52", heading: "#d9b25f" }, heading_reach: "titles_and_cards" };
    const posted: Record<string, string> = { theme_heading_reach: theme.heading_reach };
    for (const [key, name] of Object.entries(FIELD_NAMES)) posted[name] = postedValue(theme, key as keyof typeof FIELD_NAMES);
    expect(themeFromForm({ get: (k: string) => posted[k] ?? null })).toEqual(theme);
    // Every one of the seven fields is posted, so a save never wipes the stored theme.
    expect(Object.keys(posted).sort()).toEqual(
      ["theme_background", "theme_border", "theme_card", "theme_heading", "theme_heading_reach", "theme_muted_text", "theme_text"],
    );
  });

  it("sets the heading reach", () => {
    expect(withReach(EMPTY_THEME, "titles_and_cards").heading_reach).toBe("titles_and_cards");
    expect(EMPTY_THEME.heading_reach).toBe("titles");
  });

  it("hints that the reach needs a heading colour until one is picked", () => {
    expect(reachHint(EMPTY_THEME)).toBe("Pick a heading colour to use this.");
    expect(reachHint(withOverride(EMPTY_THEME, "heading", "#d9b25f"))).toBeNull();
  });

  it("says when the primary colour is shown moved, and which way", () => {
    const navy = withOverride(EMPTY_THEME, "background", "#000c36");
    expect(themeTokens(navy, "#005cb9").tokens["--primary"]).toBe("#4794F6");
    expect(primaryNote(navy, "#005cb9")).toBe("Shown lighter so it can be read");
    expect(primaryNote(EMPTY_THEME, "#ffb066")).toBe("Shown darker so it can be read");
    expect(primaryNote(EMPTY_THEME, "#1d4ed8")).toBeNull();
  });

  it("the adjusted note follows where the colour moved, not the colour scheme", () => {
    // A dark card on the default ground: a dark scheme, but gold text on the light page is darkened.
    const t = withOverride(withOverride(EMPTY_THEME, "card", "#0b1f4b"), "text", "#d9b25f");
    expect(themeTokens(t, "#005cb9").dark).toBe(true);
    expect(adjustedNote(t, "#005cb9", "text")).toBe("Shown darker so it can be read");
  });
});

describe("background style (D636)", () => {
  it("round-trips glow through the form, and solid as absent", () => {
    const glowing: EventTheme = { background: "#000c36", overrides: {}, heading_reach: "titles", background_style: "glow" };
    const post = (t: EventTheme) => {
      const values: Record<string, string> = { theme_heading_reach: t.heading_reach, theme_background_style: t.background_style ?? "solid" };
      for (const key of Object.keys(FIELD_NAMES) as ThemeField[]) values[FIELD_NAMES[key]] = postedValue(t, key);
      return { get: (k: string) => values[k] ?? null };
    };
    expect(themeFromForm(post(glowing))).toEqual(glowing);
    const solid = withStyle(glowing, "solid");
    expect(solid).not.toHaveProperty("background_style");
    expect(themeFromForm(post(solid))).toEqual(solid);
  });
});
