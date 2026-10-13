import { shortDateTime } from "@/lib/text";
import type { ActivitySubmission } from "@/lib/types";

/**
 * Revoke reasons (spec 2026-10-13, D497–D500). Pure and client-safe: the admin table, the
 * verifier's page and the attendee's history all read their wording from here, so the three
 * can't drift on what a revoke says.
 */

/** The radio value for "Other". Never stored: "Other" is always offered, so it is not a template. */
export const OTHER = "__other";
/** Matches the `revoke_reason` check in 0077, which counts characters (code points). */
export const REASON_MAX = 300;
export const MAX_REASONS = 12;
export const NAME_MAX = 60;

export const PICK_ERROR = "Pick a reason, or choose Other and type one.";
export const TOO_LONG_ERROR = `Keep the reason to ${REASON_MAX} characters or fewer.`;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const length = (s: string) => [...s].length;

/** D497: the event's templates. A database that predates 0077 has none, which leaves only "Other". */
export function reasonsOf(ev: { revoke_reasons?: string[] }): string[] {
  return ev.revoke_reasons ?? [];
}

/**
 * D498: the reason posted with a revoke. A template must still be in the event's list: one an
 * admin deleted while this dialog was open is refused, not quietly saved as if typed.
 */
export function parseRevokeReason(fd: { get(name: string): FormDataEntryValue | null }, templates: string[]): { reason: string } | { error: string } {
  const picked = String(fd.get("reason") ?? "");
  if (picked === OTHER) {
    const text = tidy(String(fd.get("other") ?? ""));
    if (!text) return { error: PICK_ERROR };
    if (length(text) > REASON_MAX) return { error: TOO_LONG_ERROR };
    return { reason: text };
  }
  return templates.includes(picked) ? { reason: picked } : { error: PICK_ERROR };
}

/** D497: the Settings textarea, one reason per line. */
export function parseReasonList(raw: string): { reasons: string[] } | { error: string } {
  const reasons = raw.split(/\r?\n/).map(tidy).filter(Boolean);
  if (reasons.length > MAX_REASONS) return { error: `Keep it to ${MAX_REASONS} reasons or fewer.` };
  if (reasons.some((r) => length(r) > REASON_MAX)) return { error: `Keep each reason to ${REASON_MAX} characters or fewer.` };
  const seen = new Set<string>();
  for (const r of reasons) {
    const key = r.toLowerCase();
    if (seen.has(key)) return { error: `"${r}" is in the list twice.` };
    seen.add(key);
  }
  return { reasons };
}

export type RevokeStamp = Pick<ActivitySubmission, "revoked_at" | "revoked_by" | "revoked_by_verifier" | "revoke_reason">;

/** D492: the admin table's tooltip. Today's "Revoked by X on <when>", plus the reason when there is one. */
export function revokeCredit(s: RevokeStamp, names: { admins: Record<string, string>; verifiers: Record<string, string> }): string {
  const who = s.revoked_by_verifier
    ? (names.verifiers[s.revoked_by_verifier] ? `${names.verifiers[s.revoked_by_verifier]} (verifier)` : "a verifier")
    : (s.revoked_by ? names.admins[s.revoked_by] : undefined) ?? "an admin";
  return `Revoked by ${who}${s.revoked_at ? ` on ${shortDateTime(s.revoked_at)}` : ""}${s.revoke_reason ? ` · ${s.revoke_reason}` : ""}`;
}

/** D500: what the attendee reads on a revoked entry. A revoke from before 0077 has no reason and keeps the old line. */
export function attendeeRevokeLabel(reason: string | null | undefined, where: "history" | "tracker"): string {
  if (!reason) return "Removed by the organiser";
  return where === "history" ? `Removed: ${reason}` : `Removed by the organiser: ${reason}`;
}
