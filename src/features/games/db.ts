import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import type { Attendee, Event } from "@/lib/types";
import { defaultConfig, hydrateGame, type Game, type GameKind } from "./config";
import { hydrateStage, type StageRow, type StageWrite } from "./phase";
import { parseGrouping, type Grouping, type TapRow } from "./race";
import type { PlayerRow } from "./survival";
import type { CheckinRow, WinnerRow } from "./draw";

// --- Games ---

export async function listGames(eventId: string): Promise<Game[]> {
  const { data, error } = await serviceClient().from("games").select("*").eq("event_id", eventId)
    .order("position").order("created_at");
  if (error) throw error;
  return (data ?? []).map(hydrateGame).filter((g): g is Game => g !== null);
}

export async function countGames(eventId: string): Promise<number> {
  const { count, error } = await serviceClient().from("games").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (error) throw error;
  return count ?? 0;
}

export async function getGame(id: string, eventId: string): Promise<Game | null> {
  const { data, error } = await serviceClient().from("games").select("*").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return data ? hydrateGame(data) : null;
}

export async function createGame(event: Pick<Event, "id" | "org_id">, kind: GameKind, title: string): Promise<Game> {
  const db = serviceClient();
  const position = await countGames(event.id);
  const { data, error } = await db.from("games")
    .insert({ org_id: event.org_id, event_id: event.id, kind, title, config: defaultConfig(kind), position })
    .select("*").single();
  if (error) throw error;
  const game = hydrateGame(data);
  if (!game) throw new Error("A new game did not parse");
  return game;
}

export async function updateGame(id: string, eventId: string, patch: { title: string; config: unknown }): Promise<void> {
  const { error } = await serviceClient().from("games").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Deletes a game and its runs and winners (cascade). A stage showing it reads as idle (D258). */
export async function deleteGame(id: string, eventId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("games").delete().eq("id", id).eq("event_id", eventId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// --- Stage ---

export async function getStage(eventId: string): Promise<StageRow> {
  const { data, error } = await serviceClient().from("game_stage").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return hydrateStage(eventId, data);
}

/** Compare-and-set (D261). Null when `expected` is stale: someone else moved the game on. */
export async function writeStage(eventId: string, expected: number, w: StageWrite): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("game_stage_write", {
    p_event_id: eventId, p_expected: expected, p_run_id: w.run_id, p_game_id: w.game_id,
    p_phase: w.phase, p_phase_data: w.phase_data, p_phase_ends_at: w.phase_ends_at,
  });
  if (error) throw error;
  const v = data as number;
  return v < 0 ? null : v;
}

// --- Runs ---

export type Run = { id: string; event_id: string; game_id: string; grouping: Grouping; started_at: string; deck: number[] | null };

const hydrateRun = (r: Record<string, unknown>): Run => ({
  id: r.id as string, event_id: r.event_id as string, game_id: r.game_id as string,
  grouping: parseGrouping(r.grouping), started_at: r.started_at as string,
  deck: Array.isArray(r.deck) ? (r.deck as unknown[]).filter((x): x is number => typeof x === "number") : null,
});

/** A new play-through. A card round's run carries its shuffled deck (D317). */
export async function createRun(game: Game, grouping: Grouping, deck: number[] | null = null): Promise<Run> {
  const { data, error } = await serviceClient().from("game_runs")
    .insert({ event_id: game.event_id, game_id: game.id, grouping, deck }).select("*").single();
  if (error) throw error;
  return hydrateRun(data);
}

export async function getRun(id: string): Promise<Run | null> {
  const { data, error } = await serviceClient().from("game_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? hydrateRun(data) : null;
}

/**
 * An event's whole attendee list, for names on the LED and the draw pool. Paged like the
 * player reads (D289): `listAttendees` stops at one request's worth of rows.
 */
export async function listRoster(eventId: string): Promise<Attendee[]> {
  return selectAll<Attendee>((from, to) => serviceClient().from("attendees")
    .select("*").eq("event_id", eventId).order("id").range(from, to));
}

/** Who has been checked in at one of this event's checkpoints (the draw's eligibility, D278). */
export async function listCheckedInIds(eventId: string, checkpointId: string): Promise<Set<string>> {
  const rows = await selectAll<{ attendee_id: string }>((from, to) => serviceClient().from("checkins")
    .select("attendee_id").eq("event_id", eventId).eq("checkpoint_id", checkpointId).order("attendee_id").range(from, to));
  return new Set(rows.map((r) => r.attendee_id));
}

/** A checkpoint's check-ins with their times, for a pool frozen at the draw (D316). */
export async function listCheckins(eventId: string, checkpointId: string): Promise<CheckinRow[]> {
  return selectAll<CheckinRow>((from, to) => serviceClient().from("checkins")
    .select("attendee_id, scanned_at").eq("event_id", eventId).eq("checkpoint_id", checkpointId).order("attendee_id").range(from, to));
}

/** The attendee a personal link belongs to. `attendees.token` is unique across the table. */
export async function getAttendeeByToken(token: string): Promise<Attendee | null> {
  const { data, error } = await serviceClient().from("attendees").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as Attendee | null) ?? null;
}

// --- Race ---

/** Joining twice is a no-op, and keeps the lane from the first join (D264). */
export async function joinRace(runId: string, attendeeId: string, laneKey: string): Promise<void> {
  const { error } = await serviceClient().from("race_taps")
    .upsert({ run_id: runId, attendee_id: attendeeId, lane_key: laneKey }, { onConflict: "run_id,attendee_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function addTaps(runId: string, attendeeId: string, n: number, liveFrom: string, liveUntil: string): Promise<number> {
  const { data, error } = await serviceClient().rpc("race_add_taps", {
    p_run_id: runId, p_attendee_id: attendeeId, p_n: n, p_live_from: liveFrom, p_live_until: liveUntil,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function listTaps(runId: string): Promise<TapRow[]> {
  return selectAll<TapRow>((from, to) => serviceClient().from("race_taps")
    .select("attendee_id, lane_key, taps, joined_at").eq("run_id", runId).order("attendee_id").range(from, to));
}

export async function getTapRow(runId: string, attendeeId: string): Promise<TapRow | null> {
  const { data, error } = await serviceClient().from("race_taps").select("attendee_id, lane_key, taps")
    .eq("run_id", runId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return (data as TapRow | null) ?? null;
}

// --- Last one standing ---

export async function joinSurvival(runId: string, attendeeId: string): Promise<void> {
  const { error } = await serviceClient().from("survival_players")
    .upsert({ run_id: runId, attendee_id: attendeeId }, { onConflict: "run_id,attendee_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function listPlayers(runId: string): Promise<PlayerRow[]> {
  return selectAll<PlayerRow>((from, to) => serviceClient().from("survival_players")
    .select("attendee_id, out_at_question").eq("run_id", runId).order("joined_at").order("attendee_id").range(from, to));
}

export async function getPlayer(runId: string, attendeeId: string): Promise<PlayerRow | null> {
  const { data, error } = await serviceClient().from("survival_players").select("attendee_id, out_at_question")
    .eq("run_id", runId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return (data as PlayerRow | null) ?? null;
}

export type AnswerResult = { ok: true; choice: number } | { ok: false; refused: "closed" | "not_player" | "out" };

/**
 * One answer (D272), judged by survival_answer on the database's clock, the one the reveal waits
 * on: only to the question on this event's stage in this run, until its deadline + 1.5 s, from a
 * player still in. The first answer counts: a second gets the first's choice back.
 */
export async function submitAnswer(eventId: string, runId: string, attendeeId: string, question: number, choice: number): Promise<AnswerResult> {
  const { data, error } = await serviceClient().rpc("survival_answer", {
    p_event_id: eventId, p_run_id: runId, p_attendee_id: attendeeId, p_question: question, p_choice: choice,
  });
  if (error) throw error;
  const v = data as number;
  if (v >= 0) return { ok: true, choice: v };
  return { ok: false, refused: v === -2 ? "not_player" : v === -3 ? "out" : "closed" };
}

export async function getAnswer(runId: string, attendeeId: string, question: number): Promise<number | null> {
  const { data, error } = await serviceClient().from("survival_answers").select("choice")
    .eq("run_id", runId).eq("attendee_id", attendeeId).eq("question_no", question).maybeSingle();
  if (error) throw error;
  return (data?.choice as number | undefined) ?? null;
}

export async function listAnswerChoices(runId: string, question: number): Promise<number[]> {
  const rows = await selectAll<{ choice: number }>((from, to) => serviceClient().from("survival_answers")
    .select("choice").eq("run_id", runId).eq("question_no", question).order("attendee_id").range(from, to));
  return rows.map((r) => r.choice);
}

export async function revealQuestion(eventId: string, expected: number, runId: string, gameId: string, question: number, correct: number): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("survival_reveal", {
    p_event_id: eventId, p_expected: expected, p_run_id: runId, p_game_id: gameId, p_question: question, p_correct: correct,
  });
  if (error) throw error;
  const v = data as number;
  return v < 0 ? null : v;
}

// --- Lucky draw ---

/** A draw's winners, voided ones included, in the order drawn. Paged (D289): 50 prizes × 500 is past one request. */
export async function listWinners(gameId: string): Promise<WinnerRow[]> {
  return selectAll<WinnerRow>((from, to) => serviceClient().from("draw_winners")
    .select("*").eq("game_id", gameId).order("drawn_at").order("id").range(from, to));
}

export async function listEventWinners(eventId: string): Promise<WinnerRow[]> {
  return selectAll<WinnerRow>((from, to) => serviceClient().from("draw_winners")
    .select("*").eq("event_id", eventId).order("id").range(from, to));
}

/**
 * Draws and moves the stage on in one transaction (D280). Null when stale or refused. `keep` is
 * a redraw's other winners, left on the stage ahead of the replacement (D281). `prizeNo` null is
 * a card round's turn (D317); `phase` "draw_rounds" opens the mosaic's rounds, with no end time
 * (D315); `extra` is merged into phase_data (spin_ms, quick, cards, round, rounds).
 */
export async function drawSpin(a: {
  eventId: string; expected: number; runId: string; gameId: string; prizeNo: number | null; count: number;
  checkpointId: string; exclude: string[]; spinEndsAt: string | null; keep?: string[];
  phase?: "draw_spinning" | "draw_rounds"; extra?: Record<string, unknown>;
}): Promise<string[] | null> {
  const { data, error } = await serviceClient().rpc("draw_spin", {
    p_event_id: a.eventId, p_expected: a.expected, p_run_id: a.runId, p_game_id: a.gameId,
    p_prize_no: a.prizeNo, p_count: a.count, p_checkpoint_id: a.checkpointId,
    p_exclude: a.exclude, p_spin_ends_at: a.spinEndsAt, p_keep: a.keep ?? [],
    p_phase: a.phase ?? "draw_spinning", p_extra: a.extra ?? {},
  });
  if (error) throw error;
  return (data as string[] | null) ?? null;
}

/** The host taps the card the participant called (D317). The prize number, or null when refused. */
export async function cardPick(a: { eventId: string; expected: number; runId: string; gameId: string; attendeeId: string; cardNo: number }): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("card_pick", {
    p_event_id: a.eventId, p_expected: a.expected, p_run_id: a.runId, p_game_id: a.gameId,
    p_attendee_id: a.attendeeId, p_card_no: a.cardNo,
  });
  if (error) throw error;
  return typeof data === "number" ? data : null;
}

/**
 * End game while a participant is still to pick (D318): they are voided, so they are not left
 * holding a draw with no prize, which would keep them out of every later draw.
 */
export async function voidPendingCard(gameId: string, attendeeId: string): Promise<void> {
  const { error } = await serviceClient().from("draw_winners").update({ void: true })
    .eq("game_id", gameId).eq("attendee_id", attendeeId).eq("void", false).is("card_no", null).is("prize_no", null);
  if (error) throw error;
}

/** "Not here" (D281): the winner stays on record, struck through, and may win again, but not this prize. */
export async function voidWinner(gameId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("draw_winners").update({ void: true })
    .eq("game_id", gameId).eq("attendee_id", attendeeId).eq("void", false).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Clears a draw's winners, e.g. after a rehearsal, so everyone is back in the pool. A card
 * round's decks go too (D322), so reopening deals a fresh one.
 */
export async function resetDraw(gameId: string): Promise<void> {
  const db = serviceClient();
  const { error } = await db.from("draw_winners").delete().eq("game_id", gameId);
  if (error) throw error;
  const { error: deckError } = await db.from("game_runs").update({ deck: null }).eq("game_id", gameId);
  if (deckError) throw deckError;
}
