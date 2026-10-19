import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { adjustmentTotals, type Adjustment } from "@/lib/adjustments";

/** D704: an activity's ad hoc points, newest first. */
export async function listAdjustments(activityId: string): Promise<Adjustment[]> {
  const { data, error } = await serviceClient().from("activity_adjustments")
    .select("id, activity_id, group_id, points, reason, added_by, created_at")
    .eq("activity_id", activityId).order("created_at", { ascending: false }).order("id");
  if (error) throw error;
  return (data ?? []) as Adjustment[];
}

/** D705: each group's net ad hoc points for one activity, as the scorers take them. */
export async function loadAdjustmentTotals(activityId: string): Promise<Map<string, number>> {
  return adjustmentTotals(await listAdjustments(activityId));
}

export async function addAdjustment(row: { activityId: string; groupId: string; points: number; reason: string; addedBy: string }): Promise<void> {
  const { error } = await serviceClient().from("activity_adjustments").insert({
    activity_id: row.activityId, group_id: row.groupId, points: row.points, reason: row.reason, added_by: row.addedBy || null,
  });
  if (error) throw error;
}

/** Only this activity's row: an id posted for another activity removes nothing. */
export async function removeAdjustment(activityId: string, id: string): Promise<void> {
  const { error } = await serviceClient().from("activity_adjustments").delete().eq("activity_id", activityId).eq("id", id);
  if (error) throw error;
}
