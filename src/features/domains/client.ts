/**
 * The domains feature's entry for anywhere outside a server component (D402, D431): the pure host
 * and path rules, and the proxy's lookup. `index.ts` re-exports this and adds the admin side.
 */
export * from "./hosts";
export * from "./routing";
export * from "./lookup";
