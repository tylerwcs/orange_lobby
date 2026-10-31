import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { QualifierSettings } from "./phase";
import { COUNTDOWN_MS } from "./game/rules";
import type { RunResult } from "./game/replay";
import type { Device, Review, Timeline } from "./game/timeline";

// The qualifier's reads and writes (D769, D795), thin over the tables and RPCs of migrations
// 0117 and 0120. The rules a client could cheat (timing, one live run, who may play, the tie
// order, the confirm) live in those RPCs; this file only shapes their rows.
// Times come back as `Date.toISOString()` strings (starts_at is stored to the millisecond, so
// nothing is lost), and numeric columns come back as JS numbers.

type Row = Record<string, unknown>;

const iso = (v: unknown): string => new Date(v as string).toISOString();
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
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

/**
 * The window and the left-out categories. `locked` once the finalists are confirmed. Only
 * `ev.id` is sent: the RPC takes org_id from the event row itself, never from the caller.
 * Throws when `closes_at` is not after `opens_at` (a table check), so validate first.
 */
export async function saveSettings(
  ev: { id: string; org_id: string },
  s: Omit<QualifierSettings, "confirmed_at">,
): Promise<"ok" | "locked"> {
  const { data, error } = await serviceClient().rpc("qualifier_save_settings", {
    p_event_id: ev.id, p_opens_at: s.opens_at, p_closes_at: s.closes_at,
    p_excluded: s.excluded_categories,
  });
  if (error) throw error;
  return codeOf("qualifier_save_settings", data, ["ok", "locked"] as const);
}

// --- Runs ---

/**
 * Starts a run on the server's clock from `seed` (the game's whole random sequence): it begins
 * when the countdown ends (`startsAt`). Starting abandons the attendee's live run. Refused
 * outside the window or after the confirm (`closed`), and for someone who may not play (`ineligible`).
 */
export async function startRun(
  eventId: string, attendeeId: string, seed: number,
): Promise<{ runId: string; startsAt: string } | { refused: "closed" | "ineligible" }> {
  const { data, error } = await serviceClient().rpc("qualifier_start", {
    p_event_id: eventId, p_attendee_id: attendeeId, p_seed: seed, p_countdown_ms: COUNTDOWN_MS,
  });
  if (error) throw error;
  const row = (data as Row[] | null)?.[0];
  if (!row) throw new Error("qualifier_start answered no row");
  if (row.refused != null) return { refused: codeOf("qualifier_start", row.refused, ["closed", "ineligible"] as const) };
  return { runId: row.run_id as string, startsAt: iso(row.starts_at) };
}

/** One of this attendee's runs, with its seed. Null when it is not theirs. */
export async function getRun(runId: string, attendeeId: string): Promise<{
  id: string; event_id: string; seed: number; starts_at: string; status: string;
} | null> {
  const { data, error } = await serviceClient().from("qualifier_runs")
    .select("id, event_id, seed, starts_at, status").eq("id", runId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    event_id: data.event_id as string,
    seed: Number(data.seed),
    starts_at: iso(data.starts_at),
    status: data.status as string,
  };
}

/**
 * Records a run the route has already replayed (replay, reviewOf): the score and the rest are
 * the server's, and the timeline is kept for review, each key at its time after the start (the
 * wire form carries gaps; the key_times column holds times, 0120). `early`: the database's clock
 * has not reached the replayed end yet; `late`: past the run cap plus grace; `done`: submitted
 * already, abandoned, or the finalists are confirmed; `refused`: not theirs, or out of bounds.
 */
export async function submitRun(
  runId: string,
  attendeeId: string,
  r: RunResult & Review & { timeline: Timeline; device: Device },
): Promise<"ok" | "early" | "late" | "done" | "refused"> {
  let at = 0;
  const keyTimes = r.timeline.times.map((gap) => (at += gap));
  const { data, error } = await serviceClient().rpc("qualifier_submit", {
    p_run_id: runId, p_attendee_id: attendeeId, p_score: r.score, p_ended_ms: r.endedMs,
    p_popped: r.popped, p_bosses: r.bosses, p_peak_cps: r.peakCps,
    p_keys: r.timeline.keys, p_key_times: keyTimes,
    p_device: r.device, p_multi: r.inserts, p_flagged: r.flagged,
  });
  if (error) throw error;
  return codeOf("qualifier_submit", data, ["ok", "early", "late", "done", "refused"] as const);
}

/** Games of the event still in flight (live and within their submit window): Confirm waits for them. */
export async function liveRunCount(eventId: string): Promise<number> {
  const { data, error } = await serviceClient().rpc("qualifier_live_count", { p_event_id: eventId });
  if (error) throw error;
  return Number(data ?? 0);
}

export type RunRow = {
  id: string; starts_at: string; status: string; score: number | null; ended_ms: number | null;
  popped: number | null; bosses: number | null; peak_cps: number | null; device: Device;
  multi_inserts: number; flagged: boolean; disqualified_at: string | null;
};

/** An attendee's runs, newest first, for the admin. */
export async function listRuns(eventId: string, attendeeId: string): Promise<RunRow[]> {
  const { data, error } = await serviceClient().from("qualifier_runs")
    .select("id, starts_at, status, score, ended_ms, popped, bosses, peak_cps, device, multi_inserts, flagged, disqualified_at")
    .eq("event_id", eventId).eq("attendee_id", attendeeId).order("starts_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    starts_at: iso(r.starts_at),
    status: r.status as string,
    score: numOrNull(r.score),
    ended_ms: numOrNull(r.ended_ms),
    popped: numOrNull(r.popped),
    bosses: numOrNull(r.bosses),
    peak_cps: numOrNull(r.peak_cps),
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
  best_score: number; best_at: string; best_run_id: string; runs_played: number; flagged: boolean; device: Device;
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
    best_score: Number(r.best_score),
    best_at: iso(r.best_at),
    best_run_id: r.best_run_id as string,
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

export type Player = { best_score: number | null; best_run_id: string | null; runs_played: number };

/** The attendee's summary, or null before their first counted run. */
export async function getPlayer(eventId: string, attendeeId: string): Promise<Player | null> {
  const { data, error } = await serviceClient().from("qualifier_players")
    .select("best_score, best_run_id, runs_played")
    .eq("event_id", eventId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    best_score: numOrNull(data.best_score),
    best_run_id: (data.best_run_id as string | null) ?? null,
    runs_played: Number(data.runs_played ?? 0),
  };
}

// --- Finalists ---

/** Freezes the board's top 10 as the finale list. `not_closed` while runs can still count. */
export async function confirmFinalists(eventId: string, by: string): Promise<"ok" | "not_closed" | "already"> {
  const { data, error } = await serviceClient().rpc("qualifier_confirm", { p_event_id: eventId, p_by: by });
  if (error) throw error;
  return codeOf("qualifier_confirm", data, ["ok", "not_closed", "already"] as const);
}

export type Finalist = { rank: number; attendee_id: string; best_score: number };

export async function listFinalists(eventId: string): Promise<Finalist[]> {
  const { data, error } = await serviceClient().from("qualifier_finalists")
    .select("rank, attendee_id, best_score").eq("event_id", eventId).order("rank");
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    rank: Number(r.rank),
    attendee_id: r.attendee_id as string,
    best_score: Number(r.best_score),
  }));
}
