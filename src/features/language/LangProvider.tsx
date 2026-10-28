"use client";

import { createContext, useContext } from "react";
import type { Lang } from "./lang";
import { t } from "./dict";
import type { Dict } from "./en";

export type { Lang } from "./lang";
export type { Dict } from "./en";
export { t } from "./dict";

const LangContext = createContext<Lang>("en");

/** Mounted by the portal chrome (D736), so every client component below reads the same language. */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = (): Lang => useContext(LangContext);
export const useT = (): Dict => t(useContext(LangContext));
