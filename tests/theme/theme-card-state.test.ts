import { describe, it, expect } from "vitest";
import { EMPTY_THEME, workedOut, type EventTheme } from "@/features/theme/client";
import { themeFromForm } from "@/features/theme/lib/form";
import { adjustedNote, pickerValue, postedValue, withOverride, withReach, FIELD_NAMES } from "@/features/theme/admin/card-state";

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
});
