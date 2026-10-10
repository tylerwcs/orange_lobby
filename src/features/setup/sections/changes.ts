/** One line of a review (D449): what Apply does to one day or session. */
export type PlanChange = {
  what: "day" | "session";
  how: "added" | "changed" | "removed" | "kept";
  label: string;
  lines: string[];
};

/** The note on an item the admin deleted that the organiser changed again (D450). */
export const RESTORED = "Deleted in admin; added back because the organiser changed it.";

const NOUNS: Record<PlanChange["what"], [string, string]> = { day: ["day", "days"], session: ["session", "sessions"] };
const HOWS = ["added", "changed", "removed"] as const;

/**
 * The review's one-line summary: "1 day added · 3 sessions added, 1 changed, 1 removed". "Kept"
 * lines are notes, not writes, so they aren't counted. Empty when nothing is written.
 */
export function changeSummary(changes: readonly PlanChange[]): string {
  const parts: string[] = [];
  for (const what of Object.keys(NOUNS) as PlanChange["what"][]) {
    const counts = HOWS.map((how) => [how, changes.filter((c) => c.what === what && c.how === how).length] as const).filter(([, n]) => n > 0);
    if (counts.length === 0) continue;
    const [[how, n], ...rest] = counts;
    parts.push([`${n} ${NOUNS[what][n === 1 ? 0 : 1]} ${how}`, ...rest.map(([h, m]) => `${m} ${h}`)].join(", "));
  }
  return parts.join(" · ");
}
