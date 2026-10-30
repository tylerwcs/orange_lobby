// Where the qualifier is in its life, and who may play it (D768). Pure, so the portal, the
// play page and the server actions all read the same clock the same way.
import { categoryParts } from "@/lib/agenda";
import { shortDateTime } from "@/lib/text";

export type QualifierSettings = {
  opens_at: string | null;
  closes_at: string | null;
  excluded_categories: string[];
  confirmed_at: string | null;
};

export type Phase = "unset" | "before" | "open" | "review" | "confirmed";

/**
 * `unset` until both ends of the window are real dates; `confirmed` once the admin has locked
 * the finalists; otherwise by the clock. `opens_at` is inclusive and `closes_at` exclusive,
 * so the instant it closes is already `review`.
 */
export function phaseOf(s: QualifierSettings | null, now: number): Phase {
  if (!s || !s.opens_at || !s.closes_at) return "unset";
  const opens = Date.parse(s.opens_at);
  const closes = Date.parse(s.closes_at);
  if (Number.isNaN(opens) || Number.isNaN(closes)) return "unset";
  if (s.confirmed_at) return "confirmed";
  if (now < opens) return "before";
  if (now < closes) return "open";
  return "review";
}

export type Ineligible = "cancelled" | "preview" | "excluded";

/**
 * Why this attendee cannot play, or null when they can. The category rule is the lucky draw's
 * (`features/games/draw.ts`): one excluded part of a multi-part category is enough; the
 * comparison is trimmed and case-insensitive; an empty list excludes no one, and an
 * attendee with no category is never excluded.
 */
export function ineligibility(
  a: { id: string; category: string | null; cancelled_at?: string | null },
  previewId: string | null | undefined,
  excluded: readonly string[],
): Ineligible | null {
  if (a.cancelled_at) return "cancelled";
  if (previewId && a.id === previewId) return "preview";
  const out = new Set(excluded.map((x) => x.trim().toLowerCase()).filter(Boolean));
  if (out.size > 0 && categoryParts(a.category).some((p) => out.has(p))) return "excluded";
  return null;
}

/** The admin page's line under the title (D770). Dates are Malaysia time, as the rest of the admin. */
export function phaseSubtitle(s: QualifierSettings | null, now: number): string {
  switch (phaseOf(s, now)) {
    case "unset": return "Not scheduled";
    case "before": return `Opens ${shortDateTime(s!.opens_at!)}`;
    case "open": return `Open until ${shortDateTime(s!.closes_at!)}`;
    case "review": return "Closed — under review";
    case "confirmed": return "Finalists confirmed";
  }
}
