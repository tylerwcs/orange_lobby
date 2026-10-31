/**
 * The qualifier's client-safe entry (D402, D403): the pure rules, all of which run in the
 * browser as well as on the server. No `server-only` import may be reachable from here.
 * Code outside this folder imports the feature only from here or from `index.ts`.
 */
export * from "./words";
export * from "./scoring";
export * from "./phase";
export * from "./board";
export * from "./input";
export * from "./screen";

// The slime game's wire format, checks and replay (D791), which the submit route runs.
export {
  checkTimeline, decodeTimeline, parseSubmitBody, reviewOf,
  type Device, type Entry, type Review, type SubmitBody, type SubmitReason, type Timeline, type TimelineRefusal,
} from "./game/timeline";
export { replay, type RunResult } from "./game/replay";

// The portal page's screens (D772, D795).
export { QualifierClient } from "./components/QualifierClient";
