/**
 * The sections an organiser fills in on the setup page (D442, D461). Info was one until the
 * Phase 2 revision made it a card; the database still accepts it, and nothing writes it.
 */
export const SETUP_SECTIONS = ["basics", "agenda"] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

/** The steps this release can fill in. The rest show on the checklist as guide cards until built (D452). */
export const BUILT_STEPS: readonly SetupSection[] = ["basics"];

/** Each section's name, as both the organiser and the admin see it. */
export const SECTION_TITLES: Record<SetupSection, string> = { basics: "Event basics", agenda: "Agenda" };

export function isBuiltStep(s: string): s is SetupSection {
  return (BUILT_STEPS as readonly string[]).includes(s);
}

/** The organiser's link, always on the main address like the crew link (D441). */
export function setupLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/setup/${token}`;
}

/** Why Submit (or Apply) is refused, as one line: the first problem, and how many more there are. */
export function problemSentence(problems: readonly string[]): string | null {
  if (problems.length === 0) return null;
  return problems.length === 1 ? problems[0] : `${problems[0]} (and ${problems.length - 1} more)`;
}
