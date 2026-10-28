/**
 * The portal's own wording in English (D736): the source of truth. `ms.ts` must match its
 * shape exactly, which `tsc` and tests/language.test.ts both check. Sentences with numbers or
 * an organiser-typed name are functions; the name goes in as an argument and is never
 * translated.
 */
export const en = {
  common: {
    languageLabel: "Language / Bahasa",
    english: "English",
    malay: "Bahasa Malaysia",
  },
};

/** The dictionary's shape, with every string widened so the Malay can say something else. */
type Widen<T> = T extends string ? string : T extends (...a: infer A) => string ? (...a: A) => string : { [K in keyof T]: Widen<T[K]> };
export type Dict = Widen<typeof en>;
