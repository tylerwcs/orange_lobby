/**
 * The activities feature's client-safe entry (D402, D403): everything here is pure and runs in
 * the browser as well as on the server. Code outside this folder imports the feature only
 * from here or from `index.ts`.
 */
export * from "./tabs";
export * from "./row";
export * from "./cards";
