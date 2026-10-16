import { DEFAULT_BACKGROUND, parseTheme, type EventTheme } from "./theme";

/** The Settings → Look form's field names (D622, D623, D632). An empty value means "not set / worked out". */
export const OVERRIDE_FIELDS = { card: "theme_card", text: "theme_text", muted_text: "theme_muted_text", border: "theme_border", heading: "theme_heading" } as const;

type FormLike = { get(name: string): FormDataEntryValue | null };

/** D622: reads the theme out of a posted form. Junk is dropped by `parseTheme`; the default ground is stored as unset. */
export function themeFromForm(fd: FormLike): EventTheme {
  const text = (name: string) => {
    const v = fd.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const overrides: Record<string, string> = {};
  for (const [key, field] of Object.entries(OVERRIDE_FIELDS)) overrides[key] = text(field);
  const bg = text("theme_background");
  return parseTheme({
    background: bg.toLowerCase() === DEFAULT_BACKGROUND.toLowerCase() ? null : bg,
    overrides,
    heading_reach: text("theme_heading_reach"),
  });
}
