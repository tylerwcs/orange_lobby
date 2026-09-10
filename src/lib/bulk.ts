/**
 * Ids from a bulk-action form, filtered against the attendees that actually belong to
 * this event. Never trust the posted list: it decides which rows get written or exported.
 */
export function parseIds(raw: string | null, allowed: Set<string>): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
