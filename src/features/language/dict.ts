import type { Lang } from "./lang";
import { en, type Dict } from "./en";
import { ms } from "./ms";

/** The wording for a language. Safe on both sides: the client provider uses it too. */
export function t(lang: Lang): Dict {
  return lang === "ms" ? ms : en;
}
