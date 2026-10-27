import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { deleteSubmissionFiles } from "@/lib/db/media";
import { nowInKL } from "@/lib/time";
import { goneEntryFiles, type MovedEntry } from "./lib";
import type { Activity } from "@/lib/types";
import type { TrackHistoryRow, TrackPair, TrackRefusal, TrackRow } from "./types";

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

/** D721: the pair's two activities, Track A then Track B; null if either is gone. Read here so this feature never imports activities' server entry, which imports it. */
export async function pairActivities(pair: TrackPair): Promise<[Activity, Activity] | null> {
  const { data, error } = await serviceClient().from("activities").select("*")
    .eq("event_id", pair.event_id).in("id", [pair.a_activity_id, pair.b_activity_id]);
  if (error) throw error;
  const rows = (data ?? []) as Activity[];
  const a = rows.find((r) => r.id === pair.a_activity_id), b = rows.find((r) => r.id === pair.b_activity_id);
  return a && b ? [a, b] : null;
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

/** D726: one person's entries today on either track of the pair, read just before a move. */
async function entriesToday(pair: TrackPair, attendeeId: string): Promise<MovedEntry[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("id, activity_id, answers, pair_id")
    .eq("attendee_id", attendeeId).eq("submitted_on", nowInKL().date).in("activity_id", [pair.a_activity_id, pair.b_activity_id]);
  if (error) throw error;
  return (data ?? []) as MovedEntry[];
}

/**
 * D723/D726: a checked placement that also clears up after itself. `set_challenge_track` removes
 * what the person logged today on the track they leave; the database can't delete files, so their
 * photos go here - only for entries that are gone now. A failed file delete leaves an object
 * nothing names, and is swallowed: the move itself has happened.
 */
export async function moveTrack(input: { pair: TrackPair; orgId: string; attendeeId: string; activityId: string | null; actorId: string | null; admin: boolean }): Promise<"ok" | TrackRefusal> {
  const before = await entriesToday(input.pair, input.attendeeId);
  const r = await setTrack({ pairId: input.pair.id, attendeeId: input.attendeeId, activityId: input.activityId, actorId: input.actorId, admin: input.admin });
  if (r !== "ok" || before.length === 0) return r;
  const after = new Set((await entriesToday(input.pair, input.attendeeId)).map((e) => e.id));
  try {
    await deleteSubmissionFiles(goneEntryFiles(before, after, { orgId: input.orgId, eventId: input.pair.event_id }));
  } catch {
    // Left behind; see above.
  }
  return r;
}

/** D730: one team's live entries today on either track of the pair - who has taken a place. */
export async function teamEntriesToday(pair: TrackPair, groupId: string): Promise<{ attendee_id: string; activity_id: string }[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("attendee_id, activity_id")
    .eq("group_id", groupId).eq("submitted_on", nowInKL().date).eq("status", "submitted").in("activity_id", [pair.a_activity_id, pair.b_activity_id]);
  if (error) throw error;
  return (data ?? []) as { attendee_id: string; activity_id: string }[];
}

/** D734: every track change in a pair, with its day - `placementsOn` turns it into one day's tracks. */
export async function trackHistory(pairId: string): Promise<TrackHistoryRow[]> {
  const { data, error } = await serviceClient().from("challenge_track_history").select("pair_id, attendee_id, group_id, activity_id, day, at").eq("pair_id", pairId);
  if (error) throw error;
  return (data ?? []) as TrackHistoryRow[];
}
