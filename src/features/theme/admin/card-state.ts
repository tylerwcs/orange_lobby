import { DEFAULT_BACKGROUND, themeTokens, workedOut, type EventTheme, type HeadingReach, type ThemeColorKey } from "../lib/theme";
import { OVERRIDE_FIELDS } from "../lib/form";

/**
 * The Settings Theme card's logic (D623, D624, D626, D631), pure so it is tested: the card holds
 * an `EventTheme` in state and draws every picker, hidden field and note through these.
 */

export type ThemeField = ThemeColorKey | "background";

/** The posted field each picker writes - the names `themeFromForm` reads (D622). */
export const FIELD_NAMES: Record<ThemeField, string> = { background: "theme_background", ...OVERRIDE_FIELDS };
export const REACH_FIELD = "theme_heading_reach";

/** D623: what a picker shows - the override, else the colour worked out from the ground (lower-case, as `<input type="color">` gives it). */
export function pickerValue(theme: EventTheme, key: ThemeField): string {
  const ground = theme.background ?? DEFAULT_BACKGROUND;
  if (key === "background") return ground.toLowerCase();
  return (theme.overrides[key] ?? workedOut(ground)[key]).toLowerCase();
}

/** D623: what a picker posts - only what the organiser set; "" is "worked out" (or the default ground). */
export function postedValue(theme: EventTheme, key: ThemeField): string {
  return (key === "background" ? theme.background : theme.overrides[key]) ?? "";
}

/** D623: a colour picked (or, with null, reset to worked out / the default ground). */
export function withOverride(theme: EventTheme, key: ThemeField, hex: string | null): EventTheme {
  const value = hex ? hex.toLowerCase() : null;
  if (key === "background") return { ...theme, background: value };
  const overrides = { ...theme.overrides };
  if (value) overrides[key] = value;
  else delete overrides[key];
  return { ...theme, overrides };
}

/** D632: how far the heading colour reaches. */
export function withReach(theme: EventTheme, heading_reach: HeadingReach): EventTheme {
  return { ...theme, heading_reach };
}

/** D624: the note beside a picked colour the portal has to move to keep it readable; null when it shows as picked. */
export function adjustedNote(theme: EventTheme, primary: string, key: ThemeColorKey): string | null {
  const { adjusted, dark } = themeTokens(theme, primary);
  if (!adjusted[key]) return null;
  return dark ? "Shown lighter so it can be read" : "Shown darker so it can be read";
}
