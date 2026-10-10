/** The sections an organiser fills in on the setup page (D442). */
export const SETUP_SECTIONS = ["basics", "agenda", "info"] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

/** The steps this release can fill in. The rest show on the checklist as guide cards until built (D452). */
export const BUILT_STEPS: readonly SetupSection[] = ["basics"];

export function isBuiltStep(s: string): s is SetupSection {
  return (BUILT_STEPS as readonly string[]).includes(s);
}
