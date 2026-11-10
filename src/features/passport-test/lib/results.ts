import type { PassportResult } from "./score";
import type { Personality } from "./settings";

/**
 * D888: how many guests got each personality, in the test's own order with zeros shown. A result
 * whose personality has since gone (only possible after clearing every result's lock) is counted
 * under "Other", which appears only when there is one.
 */
export function countByPersonality(results: PassportResult[], personalities: Personality[]): { id: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.personality_id, (counts.get(r.personality_id) ?? 0) + 1);
  const rows = personalities.map((p) => ({ id: p.id, name: p.name, count: counts.get(p.id) ?? 0 }));
  const known = new Set(personalities.map((p) => p.id));
  const other = results.filter((r) => !known.has(r.personality_id)).length;
  return other ? [...rows, { id: "other", name: "Other", count: other }] : rows;
}
