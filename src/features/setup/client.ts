/**
 * The setup feature's client-safe entry (D402, D403): the pure rules and the phone previews. `index.ts` re-exports this
 * and adds the reads, writes and screens.
 */
export * from "./sections";
export * from "./status";
export * from "./checklist";
export * from "./images";
export * from "./hub";
export * from "./sections/basics";
export * from "./sections/agenda";
export * from "./sections/agenda-apply";
export * from "./sections/changes";
export { HomePreview, type PreviewBasics, type PreviewSlot } from "./preview/HomePreview";
export { AgendaPreview, type AgendaSlot } from "./preview/AgendaPreview";
