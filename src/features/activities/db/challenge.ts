import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import type { DailyTotal } from "../lib/challenge-score";
import type { Event } from "@/lib/types";

/** `week_of` is the Monday of the week it voids (D467); null voids the whole season (D380). */
export type Disqualification = { attendee_id: string; reason: string; week_of: string | null; created_at: string; created_by: string | null };

/**
 * D375: live km per person, team and day, summed by `challenge_daily_totals` (0058). Paged: the
 * challenge reaches ~7,400 rows, past PostgREST's 1,000-row cap, and 0059 orders the function
 * by its unique group-by key so the pages cannot overlap or skip.
 */
export async function dailyTotals(activityId: string): Promise<DailyTotal[]> {
  const rows = await selectAll<{ attendee_id: string; group_id: string | null; day: string; km: number | string }>(
    // Ordered here as well as in the function body (0059), so paging never rests on a SQL
    // ORDER BY that a later migration could drop; the three columns are the unique group-by key.
    (from, to) => serviceClient().rpc("challenge_daily_totals", { p_activity_id: activityId })
      .order("attendee_id").order("day").order("group_id").range(from, to),
  );
  return rows.map((r) => ({ attendeeId: r.attendee_id, groupId: r.group_id, day: r.day, km: Number(r.km) }));
}

export async function listDisqualifications(activityId: string): Promise<Disqualification[]> {
  const { data, error } = await serviceClient().from("challenge_disqualifications")
    .select("attendee_id, reason, week_of, created_at, created_by").eq("activity_id", activityId);
  if (error) throw error;
  return (data ?? []) as Disqualification[];
}

/** D380/D467. Upsert: disqualifying twice just updates the reason and the week. */
export async function disqualify(ev: Pick<Event, "id">, activityId: string, attendeeId: string, reason: string, weekOf: string | null, userId: string): Promise<void> {
  const { error } = await serviceClient().from("challenge_disqualifications")
    .upsert({ event_id: ev.id, activity_id: activityId, attendee_id: attendeeId, reason, week_of: weekOf, created_by: userId }, { onConflict: "activity_id,attendee_id" });
  if (error) throw error;
}

export async function undoDisqualify(activityId: string, attendeeId: string): Promise<void> {
  const { error } = await serviceClient().from("challenge_disqualifications").delete().eq("activity_id", activityId).eq("attendee_id", attendeeId);
  if (error) throw error;
}
