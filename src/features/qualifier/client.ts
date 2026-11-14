/**
 * Slime Splat's client-safe entry (D402, D403, D797; the code keeps its first name, the typing
 * qualifier): the pure rules, all of which run in the browser as well as on the server. No
 * `server-only` import may be reachable from here. Code outside this folder imports the feature
 * only from here or from `index.ts`.
 */
export * from "./words";
export * from "./paths";
export * from "./phase";
export * from "./hours";
export * from "./board";
export * from "./input";
export * from "./screen";

// The slime game's wire format, checks and replay (D791), which the submit route runs.
export {
  checkSpeed, checkTimeline, decodeTimeline, parseSubmitBody, reviewOf,
  type Device, type Entry, type Review, type SubmitBody, type SubmitReason, type Timeline, type TimelineRefusal,
} from "./game/timeline";
export { replay, type Replayed, type RunResult } from "./game/replay";

// The portal page's screens (D772, D795).
export { QualifierClient } from "./components/QualifierClient";
