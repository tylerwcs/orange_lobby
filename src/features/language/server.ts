import { cache } from "react";
import { cookies } from "next/headers";
import { LANG_COOKIE, resolveLang, type Lang } from "./lang";

/**
 * The language a portal page or action speaks to this request in (D736). Read once per
 * request: every server component on the page and the chrome above it ask the same question.
 */
const cookieLang = cache(async (): Promise<string | undefined> => (await cookies()).get(LANG_COOKIE)?.value);

export async function portalLang(event: { language_switch?: boolean | null }): Promise<Lang> {
  if (!event.language_switch) return "en";
  return resolveLang(true, await cookieLang());
}
