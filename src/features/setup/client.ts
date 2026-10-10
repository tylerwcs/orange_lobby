/**
 * The setup feature's client-safe entry (D402, D403): the pure rules and the phone preview. `index.ts` re-exports this
 * and adds the reads, writes and screens.
 */
export * from "./sections";
export * from "./status";
export * from "./checklist";
export * from "./images";
export * from "./sections/basics";
export { HomePreview, type PreviewBasics, type PreviewSlot } from "./preview/HomePreview";
