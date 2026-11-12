/**
 * D902: success moments' entry (D403) - a Book or Submit that turns into a tick, the page that
 * waits while it draws (MomentGate), and the dialog that closes after. See store.ts for the phases.
 */
export {
  momentSucceeded, momentFailed, endMoment, getMoment, MOMENT_TIMING,
  type Moment, type MomentPhase,
} from "./store";
export { prefersReducedMotion } from "./dom";
export {
  useMoment, useReducedMotion, useMomentButton, useMomentDialog,
  MomentLabel, MOMENT_BUTTON, type MomentFace,
} from "./moment-button";
export { MomentGate } from "./MomentGate";
