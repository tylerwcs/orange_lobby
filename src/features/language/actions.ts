"use server";
import { cookies } from "next/headers";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, isLang, type Lang } from "./lang";

/**
 * Remember this device's language (D736). Only the cookie: the switcher refreshes the page
 * itself, and every page and action reads the cookie together with the event's own switch, so
 * a device that picked Malay on one event still sees English on an event that does not offer it.
 */
export async function setLangAction(lang: Lang): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: LANG_COOKIE_MAX_AGE, sameSite: "lax" });
}
