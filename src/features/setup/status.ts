/** JSON with object keys sorted, so two snapshots compare by content, not by key order. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

export function sameAnswers(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

export type SectionStatus = "not_started" | "draft" | "submitted" | "applied";
export type StatusRow = { answers: unknown; submitted: unknown; applied: unknown };

export const STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  applied: "Applied",
};

/**
 * Worked out from the three snapshots, never stored (D442): a stored status would be one more
 * thing to keep in step with the snapshots, and the snapshots already say it.
 */
export function sectionStatus(row: StatusRow | null): SectionStatus {
  if (!row) return "not_started";
  if (row.submitted === null || row.submitted === undefined) return "draft";
  return sameAnswers(row.submitted, row.applied) ? "applied" : "submitted";
}

/** Edits since the last submit: shown to the organiser as "You have changes you haven't submitted". */
export function hasUnsubmittedChanges(row: StatusRow | null): boolean {
  if (!row || row.submitted === null || row.submitted === undefined) return false;
  return !sameAnswers(row.answers, row.submitted);
}
