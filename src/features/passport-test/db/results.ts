import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Activity } from "@/lib/types";
import type { PassportResult } from "../lib/score";
import type { PassportTest } from "../lib/settings";

const COLUMNS = "id, activity_id, attendee_id, personality_id, answers, holder_name, created_at";
const results = () => serviceClient().from("passport_results");

/** A passport in this event, or null. This feature reads its own row: it cannot import activities (which imports it). */
export async function getTestActivity(activityId: string, eventId: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*")
    .eq("id", activityId).eq("event_id", eventId).eq("kind", "passport").maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

export async function getResult(activityId: string, attendeeId: string): Promise<PassportResult | null> {
  const { data, error } = await results().select(COLUMNS).eq("activity_id", activityId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return (data as PassportResult | null) ?? null;
}

/** One attendee's results across the event's passports, for the portal (one query, never per passport). */
export async function resultsForAttendee(attendeeId: string): Promise<PassportResult[]> {
  const { data, error } = await results().select(COLUMNS).eq("attendee_id", attendeeId);
  if (error) throw error;
  return (data ?? []) as PassportResult[];
}

/** D882: the guest's one result. Null when they already have one (23505): the caller reads it back. */
export async function insertResult(row: Omit<PassportResult, "id" | "created_at"> & { org_id: string; event_id: string }): Promise<PassportResult | null> {
  const { data, error } = await results().insert(row).select(COLUMNS).single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  return data as PassportResult;
}

export async function listResults(activityId: string): Promise<PassportResult[]> {
  const { data, error } = await results().select(COLUMNS).eq("activity_id", activityId).order("created_at");
  if (error) throw error;
  return (data ?? []) as PassportResult[];
}

export async function listResultsForEvent(eventId: string): Promise<PassportResult[]> {
  const { data, error } = await results().select(COLUMNS).eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as PassportResult[];
}

export async function countResults(activityId: string): Promise<number> {
  const { count, error } = await results().select("id", { count: "exact", head: true }).eq("activity_id", activityId);
  if (error) throw error;
  return count ?? 0;
}

/** D882: the organiser lets one guest take the test again. Their stamps are untouched. */
export async function clearResult(activityId: string, attendeeId: string): Promise<void> {
  const { error } = await results().delete().eq("activity_id", activityId).eq("attendee_id", attendeeId);
  if (error) throw error;
}

/** D887: the way out of the locks - every guest takes the test again. */
export async function clearAllResults(activityId: string): Promise<void> {
  const { error } = await results().delete().eq("activity_id", activityId);
  if (error) throw error;
}

export async function saveTest(activityId: string, eventId: string, t: PassportTest): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ passport_test: t })
    .eq("id", activityId).eq("event_id", eventId).eq("kind", "passport");
  if (error) throw error;
}
