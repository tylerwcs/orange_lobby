import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { QualifierSettings } from "./phase";
import { COUNTDOWN_MS, type Device, type Scored } from "./scoring";
import { SKINS, type SkinId } from "./progress";

// The qualifier's reads and writes (D769), thin over the tables and RPCs of migration 0117.
// The rules a client could cheat (timing, one live run, who may play, the tie order, the
// confirm) live in those RPCs; this file only shapes their rows.
// Times come back as `Date.toISOString()` strings, so two of them compare as strings the way
// `byStanding` expects (starts_at is stored to the millisecond, so nothing is lost), and
// numeric columns come back as JS numbers.

type Row = Record<string, unknown>;

const iso = (v: unknown): string => new Date(v as string).toISOString();
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const skinOf = (v: unknown): SkinId | null =>
  typeof v === "string" && (SKINS as readonly string[]).includes(v) ? (v as SkinId) : null;
const deviceOf = (v: unknown): Device => (v === "touch" || v === "keyboard" ? v : "unknown");

/** An RPC's text answer, checked against the codes it may return. */
function codeOf<T extends string>(fn: string, data: unknown, codes: readonly T[]): T {
  if (typeof data === "string" && (codes as readonly string[]).includes(data)) return data as T;
  throw new Error(`${fn} answered ${JSON.stringify(data)}`);
}

// --- Settings ---

export async function getSettings(eventId: string): Promise<QualifierSettings | null> {
  const { data, error } = await serviceClient().from("qualifier_settings")
    .select("opens_at, closes_at, excluded_categories, confirmed_at").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    opens_at: isoOrNull(data.opens_at),
    closes_at: isoOrNull(data.closes_at),
    excluded_categories: Array.isArray(data.excluded_categories) ? (data.excluded_categories as string[]) : [],
    confirmed_at: isoOrNull(data.confirmed_at),
  };
}

/** The window and the left-out categories. `locked` once the finalists are confirmed. */
export async function saveSettings(
  ev: { id: string; org_id: string },
  s: Omit<QualifierSettings, "confirmed_at">,
): Promise<"ok" | "locked"> {
  const { data, error } = await serviceClient().rpc("qualifier_save_settings", {
    p_event_id: ev.id, p_org_id: ev.org_id, p_opens_at: s.opens_at, p_closes_at: s.closes_at,
    p_excluded: s.excluded_categories,
  });
  if (error) throw error;
  return codeOf("qualifier_save_settings", data, ["ok", "locked"] as const);
}

// --- Runs ---

/**
 * Starts a run on the server's clock: it begins when the countdown ends (`startsAt`). Starting
 * abandons the attendee's live run. Refused outside the window or after the confirm (`closed`),
 * and for someone who may not play (`ineligible`).
 */
export async function startRun(
  eventId: string, attendeeId: string, words: string[],
): Promise<{ runId: string; startsAt: string } | { refused: "closed" | "ineligible" }> {
  const { data, error } = await serviceClient().rpc("qualifier_start", {
    p_event_id: eventId, p_attendee_id: attendeeId, p_words: words, p_countdown_ms: COUNTDOWN_MS,
  });
  if (error) throw error;
  const row = (data as Row[] | null)?.[0];
  if (!row) throw new Error("qualifier_start answered no row");
  if (row.refused != null) return { refused: codeOf("qualifier_start", row.refused, ["closed", "ineligible"] as const) };
  return { runId: row.run_id as string, startsAt: iso(row.starts_at) };
}

/** One of this attendee's runs, with its words. Null when it isn't theirs. */
export async function getRun(runId: string, attendeeId: string): Promise<{
  id: string; event_id: string; words: string[]; starts_at: string; status: "live" | "abandoned" | "done";
} | null> {
  const { data, error } = await serviceClient().from("qualifier_runs")
    .select("id, event_id, words, starts_at, status").eq("id", runId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    event_id: data.event_id as string,
    words: (data.words as string[] | null) ?? [],
    starts_at: iso(data.starts_at),
    status: data.status as "live" | "abandoned" | "done",
  };
}

/**
 * Records a run the route has already scored (scoreRun). `early` / `late`: outside its 30 s
 * plus grace; `done`: submitted already or abandoned; `refused`: not theirs, or over the ceiling.
 */
export async function submitRun(
  runId: string,
  attendeeId: string,
  r: Scored & { wordsDone: number; offsets: number[]; device: Device; multiInserts: number },
): Promise<"ok" | "early" | "late" | "done" | "refused"> {
  const { data, error } = await serviceClient().rpc("qualifier_submit", {
    p_run_id: runId, p_attendee_id: attendeeId, p_wpm: r.wpm, p_accuracy: r.accuracy,
    p_words_done: r.wordsDone,
    // The column is int[]; a browser's timer can hand back fractions of a millisecond.
    p_offsets: r.offsets.map((o) => Math.round(o)),
    p_device: r.device, p_multi: r.multiInserts, p_flagged: r.flagged,
  });
  if (error) throw error;
  return codeOf("qualifier_submit", data, ["ok", "early", "late", "done", "refused"] as const);
}

/** A run's word finish times, for a ghost. Null when the run is not this event's. */
export async function runOffsets(runId: string, eventId: string): Promise<number[] | null> {
  const { data, error } = await serviceClient().from("qualifier_runs")
    .select("offsets").eq("id", runId).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.offsets) ? (data.offsets as unknown[]).map(Number) : null;
}

export type RunRow = {
  id: string; starts_at: string; status: string; wpm: number | null; accuracy: number | null;
  words_done: number | null; device: Device; multi_inserts: number; flagged: boolean; disqualified_at: string | null;
};

/** An attendee's runs, newest first, for the admin. */
export async function listRuns(eventId: string, attendeeId: string): Promise<RunRow[]> {
  const { data, error } = await serviceClient().from("qualifier_runs")
    .select("id, starts_at, status, wpm, accuracy, words_done, device, multi_inserts, flagged, disqualified_at")
    .eq("event_id", eventId).eq("attendee_id", attendeeId).order("starts_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    starts_at: iso(r.starts_at),
    status: r.status as string,
    wpm: numOrNull(r.wpm),
    accuracy: numOrNull(r.accuracy),
    words_done: numOrNull(r.words_done),
    device: deviceOf(r.device),
    multi_inserts: Number(r.multi_inserts ?? 0),
    flagged: r.flagged === true,
    disqualified_at: isoOrNull(r.disqualified_at),
  }));
}

/** Disqualify (`on`) or restore a run; the attendee's best is recomputed. `locked` once confirmed. */
export async function setDisqualified(eventId: string, runId: string, on: boolean): Promise<"ok" | "locked" | "missing"> {
  const { data, error } = await serviceClient().rpc("qualifier_set_disqualified", {
    p_event_id: eventId, p_run_id: runId, p_on: on,
  });
  if (error) throw error;
  return codeOf("qualifier_set_disqualified", data, ["ok", "locked", "missing"] as const);
}

// --- Board ---

export type BoardRow = {
  rank: number; attendee_id: string; name: string; extra: Record<string, unknown> | null;
  best_wpm: number; best_accuracy: number; best_at: string; best_run_id: string; skin: SkinId | null;
  runs_played: number; flagged: boolean; device: Device;
};

/** A page of the board, in rank order. Only eligible players with a best are on it. */
export async function listBoard(eventId: string, limit: number, offset: number): Promise<BoardRow[]> {
  const { data, error } = await serviceClient().rpc("qualifier_board", {
    p_event_id: eventId, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    rank: Number(r.rank),
    attendee_id: r.attendee_id as string,
    name: r.name as string,
    extra: r.extra && typeof r.extra === "object" ? (r.extra as Record<string, unknown>) : null,
    best_wpm: Number(r.best_wpm),
    best_accuracy: Number(r.best_accuracy),
    best_at: iso(r.best_at),
    best_run_id: r.best_run_id as string,
    skin: skinOf(r.skin),
    runs_played: Number(r.runs_played ?? 0),
    flagged: r.flagged === true,
    device: deviceOf(r.device),
  }));
}

export async function boardSize(eventId: string): Promise<number> {
  const { data, error } = await serviceClient().rpc("qualifier_board_size", { p_event_id: eventId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** This attendee's place on the board, or null when they are not on it. */
export async function rankOf(eventId: string, attendeeId: string): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("qualifier_rank", { p_event_id: eventId, p_attendee_id: attendeeId });
  if (error) throw error;
  return numOrNull(data);
}

// --- Player ---

export type Player = {
  best_wpm: number | null; best_accuracy: number | null; best_run_id: string | null; runs_played: number;
  run_days: string[]; skin: SkinId | null; last_seen_rank: number | null;
};

/** The attendee's summary, or null before their first counted run. */
export async function getPlayer(eventId: string, attendeeId: string): Promise<Player | null> {
  const { data, error } = await serviceClient().from("qualifier_players")
    .select("best_wpm, best_accuracy, best_run_id, runs_played, run_days, skin, last_seen_rank")
    .eq("event_id", eventId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    best_wpm: numOrNull(data.best_wpm),
    best_accuracy: numOrNull(data.best_accuracy),
    best_run_id: (data.best_run_id as string | null) ?? null,
    runs_played: Number(data.runs_played ?? 0),
    run_days: Array.isArray(data.run_days) ? (data.run_days as string[]) : [],
    skin: skinOf(data.skin),
    last_seen_rank: numOrNull(data.last_seen_rank),
  };
}

/** The ship's colour. Decoration only. A player row exists from the first run, which unlocks the first skin. */
export async function setSkin(eventId: string, attendeeId: string, skin: SkinId): Promise<void> {
  const { error } = await serviceClient().from("qualifier_players")
    .update({ skin }).eq("event_id", eventId).eq("attendee_id", attendeeId);
  if (error) throw error;
}

/** The rank the attendee last saw, for the "you dropped" notice. */
export async function markSeen(eventId: string, attendeeId: string, rank: number | null): Promise<void> {
  const { error } = await serviceClient().from("qualifier_players")
    .update({ last_seen_rank: rank }).eq("event_id", eventId).eq("attendee_id", attendeeId);
  if (error) throw error;
}

// --- Finalists ---

/** Freezes the board's top 10 as the finale list. `not_closed` while runs can still count. */
export async function confirmFinalists(eventId: string, by: string): Promise<"ok" | "not_closed" | "already"> {
  const { data, error } = await serviceClient().rpc("qualifier_confirm", { p_event_id: eventId, p_by: by });
  if (error) throw error;
  return codeOf("qualifier_confirm", data, ["ok", "not_closed", "already"] as const);
}

export type Finalist = { rank: number; attendee_id: string; best_wpm: number; best_accuracy: number; skin: SkinId | null };

export async function listFinalists(eventId: string): Promise<Finalist[]> {
  const { data, error } = await serviceClient().from("qualifier_finalists")
    .select("rank, attendee_id, best_wpm, best_accuracy, skin").eq("event_id", eventId).order("rank");
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    rank: Number(r.rank),
    attendee_id: r.attendee_id as string,
    best_wpm: Number(r.best_wpm),
    best_accuracy: Number(r.best_accuracy),
    skin: skinOf(r.skin),
  }));
}
