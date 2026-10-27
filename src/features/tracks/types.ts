/**
 * Mileage x Active (D721-D730): two scored activities linked as a pair, Track A and Track B, and
 * who in each team is on which. One row per pair; one row per attendee per pair.
 */
export type TrackPair = {
  id: string;
  event_id: string;
  /** Track A. */
  a_activity_id: string;
  /** Track B. */
  b_activity_id: string;
  /** D724: people per track the page aims for; shown, never enforced. */
  target: number;
  /** D727: the weekly bonus when every member logs every day on either track. */
  bonus: number;
};

/** D722: counts only while `group_id` is the attendee's current group and they are not cancelled. */
export type TrackRow = { pair_id: string; attendee_id: string; group_id: string; activity_id: string };

/** D725: how an attendee stands on one activity of a pair - their track, the other one, or neither. */
export type TrackStatus = "this" | "other" | "none";

/** What `set_challenge_track` can refuse with (D723). */
export type TrackRefusal = "missing" | "not_member" | "not_allowed" | "closed";

/** D731: one track change and the Malaysian day it happened; a null activity is "taken off a track". */
export type TrackHistoryRow = { pair_id: string; attendee_id: string; group_id: string; activity_id: string | null; day: string; at: string };
