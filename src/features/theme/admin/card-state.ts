import { hexToRgb, rgbToOklab } from "@/lib/contrast";
import { DEFAULT_BACKGROUND, themeTokens, workedOut, type BackgroundStyle, type EventTheme, type HeadingReach, type ThemeColorKey } from "../lib/theme";
import { OVERRIDE_FIELDS } from "../lib/form";

/**
 * The Settings Theme card's logic (D623, D624, D626, D631), pure so it is tested: the card holds
 * an `EventTheme` in state and draws every picker, hidden field and note through these.
 */

export type ThemeField = ThemeColorKey | "background";

/** The posted field each picker writes - the names `themeFromForm` reads (D622). */
export const FIELD_NAMES: Record<ThemeField, string> = { background: "theme_background", ...OVERRIDE_FIELDS };
export const REACH_FIELD = "theme_heading_reach";
export const STYLE_FIELD = "theme_background_style";

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

/** D636: solid or glow; solid is stored as absent. */
export function withStyle(theme: EventTheme, style: BackgroundStyle): EventTheme {
  const next = { ...theme };
  if (style === "glow") next.background_style = "glow";
  else delete next.background_style;
  return next;
}

/** D632: how far the heading colour reaches. */
export function withReach(theme: EventTheme, heading_reach: HeadingReach): EventTheme {
  return { ...theme, heading_reach };
}

/** Which way a colour was moved to be read - by where it ended up, not by the theme's scheme. */
function moved(picked: string, shown: string): string {
  const L = (hex: string) => rgbToOklab(hexToRgb(hex)!)[0];
  return L(shown) > L(picked) ? "Shown lighter so it can be read" : "Shown darker so it can be read";
}

/** The tokens each override ships as, in the order the note reads them (text: the page's, then the cards'). */
const SHOWN: Record<ThemeColorKey, string[]> = {
  card: ["--card"],
  text: ["--foreground", "--card-foreground"],
  muted_text: ["--muted-foreground"],
  border: ["--border"],
  heading: ["--heading"],
};

/**
 * D624: the note beside a picked colour the portal has to move to keep it readable; null when it
 * shows as picked. "Lighter" or "darker" is read off the colour that ships against the one picked:
 * the surface it sits on decides, and that is not always the scheme's (a dark card on a light page).
 */
export function adjustedNote(theme: EventTheme, primary: string, key: ThemeColorKey): string | null {
  if (!themeTokens(theme, primary).adjusted[key]) return null;
  const picked = theme.overrides[key];
  if (!picked) return null;
  // The whole worked-out set, so a colour moved back onto a default value is still there to compare.
  const { tokens } = themeTokens({ ...theme, background: theme.background ?? DEFAULT_BACKGROUND }, primary);
  const shown = SHOWN[key].map((t) => tokens[t]).find((v) => v && v.toLowerCase() !== picked.toLowerCase());
  return shown ? moved(picked, shown) : null;
}

/** D72/D624: the note beside the primary colour when the portal shows it moved (as text on this theme's grounds). */
export function primaryNote(theme: EventTheme, primary: string): string | null {
  const shown = themeTokens(theme, primary).tokens["--primary"];
  if (!hexToRgb(primary) || !shown || shown.toLowerCase() === primary.toLowerCase()) return null;
  return moved(primary, shown);
}

/** D632: the reach only matters once a heading colour is picked; until then headings are the text colour. */
export function reachHint(theme: EventTheme): string | null {
  return theme.overrides.heading ? null : "Pick a heading colour to use this.";
}
