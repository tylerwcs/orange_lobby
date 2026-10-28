import { shortDateTime } from "@/lib/text";
import type { ActivitySubmission } from "@/lib/types";
import { t, type Lang } from "@/features/language/client";

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

export type RestoreStamp = Pick<ActivitySubmission, "restored_at" | "restored_by" | "restored_by_verifier">;

/** D735: "Restored by X on <when>" for a live entry whose revoke was undone; null otherwise. Named as `revokeCredit` names. */
export function restoreCredit(s: RestoreStamp, names: { admins: Record<string, string>; verifiers: Record<string, string> }): string | null {
  if (!s.restored_at) return null;
  const who = s.restored_by_verifier
    ? (names.verifiers[s.restored_by_verifier] ? `${names.verifiers[s.restored_by_verifier]} (verifier)` : "a verifier")
    : (s.restored_by ? names.admins[s.restored_by] : undefined) ?? "an admin";
  return `Restored by ${who} on ${shortDateTime(s.restored_at)}`;
}

/** D735: why Undo revoke was refused - each a limit a new entry meets too, so revoking the newer entry frees it. */
export function restoreRefusal(code: "missing" | "today" | "limit" | "groupdone" | "trackfull"): string {
  switch (code) {
    case "missing": return "That entry isn't revoked any more.";
    case "today": return "They already have a live entry on that day. Revoke it first, then undo this one.";
    case "limit": return "They're already at this form's limit. Revoke one of their newer entries first.";
    case "groupdone": return "Their group already has all its entries. Revoke one of the group's newer entries first.";
    case "trackfull": return "Their team's track already has its full number of people logged that day. Revoke one of them first.";
  }
}

/**
 * D500: what the attendee reads on a revoked entry, with when it was removed. A revoke from
 * before 0077 has no reason and keeps the old line.
 */
export function attendeeRevokeLabel(s: Pick<RevokeStamp, "revoke_reason" | "revoked_at">, where: "history" | "tracker", lang: Lang = "en"): string {
  // D750: the words around the organiser's reason follow the portal's language; the reason stays as typed.
  const d = t(lang).submission.revoked;
  const when = s.revoked_at ? d.on(shortDateTime(s.revoked_at, lang)) : "";
  if (!s.revoke_reason) return d.byOrganiser(when);
  return where === "history" ? d.withReason(when, s.revoke_reason) : d.byOrganiserReason(when, s.revoke_reason);
}
