import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { TrackPair, TrackRefusal, TrackRow } from "./types";

const PAIR = "id, event_id, a_activity_id, b_activity_id, target, bonus";
const ROW = "pair_id, attendee_id, group_id, activity_id";

/** D721: the pair this activity is a track of, or null - which is every activity but the two tracks. */
export async function pairForActivity(activityId: string): Promise<TrackPair | null> {
  const { data, error } = await serviceClient().from("challenge_track_pairs").select(PAIR)
    .or(`a_activity_id.eq.${activityId},b_activity_id.eq.${activityId}`).maybeSingle();
  if (error) throw error;
  return (data as TrackPair | null) ?? null;
}

export async function pairsForEvent(eventId: string): Promise<TrackPair[]> {
  const { data, error } = await serviceClient().from("challenge_track_pairs").select(PAIR).eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as TrackPair[];
}

/** D722: every placement in a pair, stale ones included - `trackOf` decides which count. */
export async function trackRows(pairId: string): Promise<TrackRow[]> {
  const { data, error } = await serviceClient().from("challenge_track_members").select(ROW).eq("pair_id", pairId);
  if (error) throw error;
  return (data ?? []) as TrackRow[];
}

/** One attendee's placements, across every pair of the event. */
export async function trackRowsFor(attendeeId: string): Promise<TrackRow[]> {
  const { data, error } = await serviceClient().from("challenge_track_members").select(ROW).eq("attendee_id", attendeeId);
  if (error) throw error;
  return (data ?? []) as TrackRow[];
}

/** D723: one checked placement through `set_challenge_track`. A null activity takes the person off their track. */
export async function setTrack(input: { pairId: string; attendeeId: string; activityId: string | null; actorId: string | null; admin: boolean }): Promise<"ok" | TrackRefusal> {
  const { data, error } = await serviceClient().rpc("set_challenge_track", {
    p_pair_id: input.pairId, p_attendee_id: input.attendeeId, p_activity_id: input.activityId, p_actor_id: input.actorId, p_admin: input.admin,
  });
  if (error) throw error;
  return data as "ok" | TrackRefusal;
}
