"use client";

import { createContext, useContext } from "react";
import type { Lang } from "./lang";
import { t } from "./dict";
import type { Dict } from "./en";
import { say, type SayKey } from "./say";

const LangContext = createContext<Lang>("en");

/** Mounted by the portal chrome (D736), so every client component below reads the same language. */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = (): Lang => useContext(LangContext);
export const useT = (): Dict => t(useContext(LangContext));

/**
 * A plain wording from a server component that has no language to hand (D741): the client
 * reads it from the portal's provider, so a sync helper deep in a page need not be threaded.
 */
export function Say({ k }: { k: SayKey }) {
  return <>{say(useT(), k)}</>;
}
