/**
 * The personality passport test's client-safe entry (D402, D403): its pure rules. Code outside
 * this folder imports the feature only from here or from `index.ts`. It never imports the
 * activities feature, which imports it.
 */
export * from "./lib/settings";
export * from "./lib/travel-set";
export * from "./lib/rules";
export * from "./lib/shades";
export * from "./lib/score";
export * from "./lib/forms";
export * from "./lib/results";
