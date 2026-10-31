/**
 * The catalogue's client-safe entry (D402, D403): the feature list and the pure rules over it.
 * `index.ts` re-exports this and adds the database reads and the admin screens.
 */
export * from "./catalogue";
export * from "./features";
export * from "./custom-modules";
export type { Option } from "./options";
export type { EventUsage } from "./usage";
export { optionsInUse } from "./usage";
