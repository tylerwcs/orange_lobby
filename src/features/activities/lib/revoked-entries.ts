import type { Activity, ActivitySubmission } from "@/lib/types";
import { isGroupForm } from "./submissions";

/**
 * D500/D501: which revoked entries one form shows an attendee. For display only - canSubmit,
 * group progress and every count keep reading the live lists, which never hold a revoked row.
 */
export function revokedFor(form: Pick<Activity, "id" | "group_mode">, mine: ActivitySubmission[], group: ActivitySubmission[]): ActivitySubmission[] {
  const pool = isGroupForm(form.group_mode) ? group : mine;
  return pool.filter((s) => s.activity_id === form.id && s.status === "revoked");
}
