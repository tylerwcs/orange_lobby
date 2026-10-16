import { dropBlankAnswers } from "@/lib/registration";

export function mergeExtra(existing: Record<string, string>, incoming?: Record<string, string>): Record<string, string> {
  return { ...existing, ...(incoming ?? {}) };
}

/**
 * D587: registering (or being added) again reactivates a cancelled registration. A blank answer
 * never erases a value already on file: an upsert is how a re-registration and a walk-in both
 * arrive, and neither is a reason to drop what the masterlist supplied.
 * D614: a cancelled row also drops its old reason. An active row keeps it - it may belong to a waiting request.
 */
export function reactivationPatch<T extends { extra?: Record<string, string> }>(existing: { extra: Record<string, string>; cancelled_at?: string | null }, input: T) {
  return { ...input, extra: mergeExtra(existing.extra, dropBlankAnswers(input.extra ?? {})), cancelled_at: null, ...(existing.cancelled_at ? { cancel_reason: null } : {}) };
}
