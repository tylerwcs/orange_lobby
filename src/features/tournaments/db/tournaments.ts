import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import type { Activity } from "@/lib/types";
import type { SquadPerson, SquadRefusal, SquadRow, TournamentSport } from "../lib/squads";

/** The tournament an id names in this event, or null (any other kind is null too). */
export async function getTournamentActivity(id: string, eventId: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*").eq("id", id).eq("event_id", eventId).eq("kind", "tournament").maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

export const SPORT_COLUMNS = "id, activity_id, name, min_size, max_size, position, result_kind, format, pool_size, forfeits_marked_at";

type SportInput = { name: string; min_size: number; max_size: number; result_kind?: "score" | "time"; format?: "pools" | "manual"; pool_size?: number };

/** A tournament's sports in the organiser's order (D638). */
export async function listSports(activityId: string): Promise<TournamentSport[]> {
  const { data, error } = await serviceClient().from("tournament_sports").select(SPORT_COLUMNS)
    .eq("activity_id", activityId).order("position").order("created_at");
  if (error) throw error;
  return (data ?? []) as TournamentSport[];
}

/** Every sport of these tournaments, for the admin list's one line each. */
export async function listSportsForActivities(activityIds: string[]): Promise<TournamentSport[]> {
  if (activityIds.length === 0) return [];
  const { data, error } = await serviceClient().from("tournament_sports").select(SPORT_COLUMNS)
    .in("activity_id", activityIds).order("position").order("created_at");
  if (error) throw error;
  return (data ?? []) as TournamentSport[];
}

/** Added last. A name already taken in this tournament (any case) is `duplicate`. */
export async function createSport(activityId: string, s: SportInput): Promise<"ok" | "duplicate"> {
  const db = serviceClient();
  const { data: last } = await db.from("tournament_sports").select("position").eq("activity_id", activityId)
    .order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("tournament_sports").insert({ activity_id: activityId, ...s, position: (last?.position ?? -1) + 1 });
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return "ok";
}

/** Rename or resize. Resizing never removes anyone (D638): a squad over the new max shows as Over. */
export async function updateSport(activityId: string, sportId: string, s: SportInput): Promise<"ok" | "duplicate"> {
  const { error } = await serviceClient().from("tournament_sports").update(s).eq("activity_id", activityId).eq("id", sportId);
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return "ok";
}

/** Swaps places with the neighbour above or below; at either end it does nothing. */
export async function moveSport(activityId: string, sportId: string, dir: "up" | "down"): Promise<void> {
  const sports = await listSports(activityId);
  const i = sports.findIndex((s) => s.id === sportId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sports.length) return;
  // Rewrites every position as its index first, so ties from older rows can't make the swap a no-op.
  const order = sports.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  const db = serviceClient();
  for (const [position, id] of order.entries()) {
    const { error } = await db.from("tournament_sports").update({ position }).eq("activity_id", activityId).eq("id", id);
    if (error) throw error;
  }
}

/** Its squads cascade. */
export async function deleteSport(activityId: string, sportId: string): Promise<void> {
  const { error } = await serviceClient().from("tournament_sports").delete().eq("activity_id", activityId).eq("id", sportId);
  if (error) throw error;
}

/**
 * Every squad row of the tournament's sports, counted or not: the caller counts them with
 * `countedRows` (D643). Paged (D289), ordered to the end on the key so pages never overlap.
 */
export async function squadRows(activityId: string): Promise<SquadRow[]> {
  const sports = await listSports(activityId);
  if (sports.length === 0) return [];
  return selectAll<SquadRow>((from, to) => serviceClient().from("tournament_squad_members")
    .select("sport_id, group_id, attendee_id, added_by, added_at")
    .in("sport_id", sports.map((s) => s.id)).order("sport_id").order("attendee_id").range(from, to));
}

const ID_CHUNK = 200;

/** The people in these rows, cancelled ones included, so `countedRows` can tell them apart. */
export async function squadPeople(eventId: string, ids: string[]): Promise<Map<string, SquadPerson>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, SquadPerson>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    // any-status: a cancelled person's row must be seen to be ignored
    const { data, error } = await serviceClient().from("attendees").select("id, name, group_id, cancelled_at")
      .eq("event_id", eventId).in("id", unique.slice(i, i + ID_CHUNK));
    if (error) throw error;
    for (const p of (data ?? []) as SquadPerson[]) out.set(p.id, p);
  }
  return out;
}

type SquadWrite = { sportId: string; attendeeId: string; actorId: string | null; admin: boolean };

/** D642: one checked add, through `add_squad_member`. */
export async function addSquadMember(input: SquadWrite): Promise<"ok" | SquadRefusal> {
  const { data, error } = await serviceClient().rpc("add_squad_member", {
    p_sport_id: input.sportId, p_attendee_id: input.attendeeId, p_actor_id: input.actorId, p_admin: input.admin,
  });
  if (error) throw error;
  return data as "ok" | SquadRefusal;
}

/** D642: one checked removal, through `remove_squad_member`. */
export async function removeSquadMember(input: SquadWrite): Promise<"ok" | SquadRefusal> {
  const { data, error } = await serviceClient().rpc("remove_squad_member", {
    p_sport_id: input.sportId, p_attendee_id: input.attendeeId, p_actor_id: input.actorId, p_admin: input.admin,
  });
  if (error) throw error;
  return data as "ok" | SquadRefusal;
}
