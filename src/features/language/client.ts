/**
 * The portal language feature's client-safe entry (D403, D736): the dictionaries, the date-free
 * helpers and the client components, importable from components and server code alike.
 */
export * from "./lang";
export { t } from "./dict";
export type { Dict } from "./en";
export { say, type SayKey } from "./say";
export { richParts, type RichPart } from "./rich";
export { RichLine } from "./RichLine";
export { LangProvider, useLang, useT, Say } from "./LangProvider";
export { LangSwitch } from "./LangSwitch";
