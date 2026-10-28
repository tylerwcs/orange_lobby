/**
 * The portal's languages (D736). English is the default and the only language of every event
 * that has not turned its switch on; Bahasa Malaysia is the one other. Only the app's own
 * wording follows the choice - anything the organiser typed shows as typed.
 */
export type Lang = "en" | "ms";

/** One device, one preference: not per event, and it holds nothing personal. */
export const LANG_COOKIE = "portal_lang";
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Malay only when the event offers it and this device asked for it. Turning an event's switch
 * off puts everyone on it back on English at once, whatever their cookie says.
 */
export function resolveLang(switchOn: boolean, cookie: string | undefined): Lang {
  return switchOn && cookie === "ms" ? "ms" : "en";
}

export const isLang = (v: unknown): v is Lang => v === "en" || v === "ms";
