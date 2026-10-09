/**
 * The activities feature's client-safe entry (D402, D403): everything here is pure and runs in
 * the browser as well as on the server. Code outside this folder imports the feature only
 * from here or from `index.ts`.
 */
export * from "./tabs";
export * from "./row";
export * from "./cards";
export * from "./kinds/meta";

// The rules (D421): pure, so the portal shell, the agenda, check-in, groups and the exports
// can use them without pulling in a screen or a database read.
export * from "./lib/activities";
export * from "./lib/activity-card";
export * from "./lib/activity-requests";
export * from "./lib/booking-door";
export * from "./lib/booths";
export * from "./lib/challenge";
export * from "./lib/challenge-score";
export * from "./lib/leaderboard";
export * from "./lib/portal-activities";
export * from "./lib/session-grid";
export * from "./lib/session-slots";
export * from "./lib/submissions";
export * from "./lib/tracker";
