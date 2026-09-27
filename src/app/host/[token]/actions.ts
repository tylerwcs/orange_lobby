"use server";
import type { Event } from "@/lib/types";
import type { Game } from "@/lib/games/config";
import { forgetStage, hostLinkState, liveStage } from "@/lib/games/live";
import { forgetPool, poolFor } from "@/lib/games/display-state";
import { createRun, drawSpin, getGame, listWinners, revealQuestion, voidWinner, writeStage } from "@/lib/db/games";
import {
  canDo, canReveal, currentQuestion, drawReadyWrite, drawRevealWrite, idleWrite, lobbyWrite, overWrite, questionWrite, raceStartWrite,
  raceStopWrite, revealFacts, spinFacts, SPIN_MS, type HostAction, type StageRow, type StageWrite,
} from "@/lib/games/phase";
import { parseGrouping, type Grouping } from "@/lib/games/race";
import { isOver } from "@/lib/games/survival";
import { drawCount, nextPrize, prizeProgress } from "@/lib/games/draw";
import { eventFields } from "@/lib/attendee-fields";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";

export type HostResult = { ok: true; message?: string } | { ok: false; message: string };

const STALE: HostResult = { ok: false, message: "Someone else moved the game on. Showing the latest." };
const NOT_YET: HostResult = { ok: false, message: "Not yet — the last answers are still coming in." };
const fail = (message: string): HostResult => ({ ok: false, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type Ready = { event: Event; stage: StageRow; game: Game | null };

/**
 * The token is the only authority (D252): a server action is a public POST, so every call
 * re-checks the host link and takes the event from it, never from the caller. The stage is
 * re-read, not taken from the memo, so a console on this instance never acts on a second-old
 * stage; and the game on it comes from liveStage, which only ever loads this event's game.
 */
async function load(token: string): Promise<Ready | HostResult> {
  if (typeof token !== "string" || !isValidToken(token)) return fail("This host link no longer works. Ask the organiser for a new one.");
  if (!allow(`host:${token}`, 120, 60_000)) return fail("Too many taps at once. Wait a moment.");
  const link = await hostLinkState(token);
  if ("refused" in link) return fail("This host link no longer works. Ask the organiser for a new one.");
  forgetStage(link.event.id);
  const { stage, game } = await liveStage(link.event.id, Date.now());
  return { event: link.event, stage, game };
}

/**
 * Every host action starts here: the link must still work, the version must be the one the
 * console was showing (D261), and the action must fit the phase.
 */
async function begin(token: string, expected: number, action: HostAction): Promise<Ready | HostResult> {
  const b = await load(token);
  if ("ok" in b) return b;
  if (b.stage.version !== expected || !canDo(b.stage.phase, action)) return STALE;
  return b;
}

async function commit(event: Event, expected: number, w: StageWrite, message?: string): Promise<HostResult> {
  const v = await writeStage(event.id, expected, w);
  forgetStage(event.id);
  return v === null ? STALE : { ok: true, message };
}

/** A race's lanes (D263). A field must still be one of this event's; its label is the event's. */
function laneGrouping(event: Event, raw: unknown): Grouping | null {
  const g = parseGrouping(raw);
  if (g.by !== "field") return g;
  const field = eventFields(event.registration_questions, event.attendee_fields).find((f) => f.key === g.key);
  return field ? { by: "field", key: field.key, label: field.label } : null;
}

export async function openGameAction(token: string, expected: number, gameId: string, grouping: unknown): Promise<HostResult> {
  const b = await begin(token, expected, "open");
  if ("ok" in b) return b;
  const game = isId(gameId) ? await getGame(gameId, b.event.id) : null;
  if (!game) return fail("That game no longer exists.");
  if (game.kind === "survival" && game.config.questions.length === 0) return fail("This game has no questions yet. Add them in admin first.");
  if (game.kind === "draw" && !game.config.checkpoint_id) return fail("Pick a checkpoint for this draw in admin first.");
  if (game.kind === "draw" && game.config.prizes.length === 0) return fail("This draw has no prizes yet. Add them in admin first.");
  const lanes = game.kind === "tap_race" ? laneGrouping(b.event, grouping) : { by: "solo" as const };
  if (!lanes) return fail("That field is no longer on this event. Pick other lanes.");
  const run = await createRun(game, lanes);
  return commit(b.event, expected, lobbyWrite(game, run.id));
}

export async function startAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "start");
  if ("ok" in b) return b;
  const now = Date.now();
  if (b.game?.kind === "tap_race") return commit(b.event, expected, raceStartWrite(b.stage, now, b.game.config.duration_s));
  if (b.game?.kind === "survival") {
    if (b.game.config.questions.length === 0) return fail("This game has no questions yet. Add them in admin first.");
    return commit(b.event, expected, questionWrite(b.stage, 0, now, b.game.config.answer_s));
  }
  return STALE;
}

export async function stopAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "stop");
  if ("ok" in b) return b;
  return commit(b.event, expected, raceStopWrite(b.stage, Date.now()));
}

/**
 * Reveal waits for the answer grace (D272). survival_reveal refuses before then with the same
 * -1 as a stale version, so the wait is checked here first; that is what lets the host hear
 * "not yet" instead of "someone else moved the game on".
 */
export async function revealAction(token: string, expected: number): Promise<HostResult> {
  const b = await load(token);
  if ("ok" in b) return b;
  if (b.stage.version !== expected) return STALE;
  if (b.stage.phase === "survival_question" || (canDo(b.stage.phase, "reveal") && !canReveal(b.stage, Date.now()))) return NOT_YET;
  if (!canDo(b.stage.phase, "reveal")) return STALE;
  const q = currentQuestion(b.stage);
  if (b.game?.kind !== "survival" || q === null || !b.stage.run_id) return STALE;
  const item = b.game.config.questions[q];
  if (!item) return fail("That question was removed in admin.");
  const v = await revealQuestion(b.event.id, expected, b.stage.run_id, b.game.id, q, item.correct);
  forgetStage(b.event.id);
  if (v !== null) return { ok: true };
  // Refused after all: the database's clock may be a little behind ours. Same version and
  // still inside the grace is "not yet"; anything else is someone else's move.
  const now = Date.now();
  const { stage } = await liveStage(b.event.id, now);
  return stage.version === expected && !canReveal(stage, now) ? NOT_YET : STALE;
}

export async function nextAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "next");
  if ("ok" in b) return b;
  const q = currentQuestion(b.stage);
  const facts = revealFacts(b.stage);
  if (b.game?.kind !== "survival" || q === null || !facts) return STALE;
  if (isOver(facts.remaining, q, b.game.config.questions.length)) return fail("That was the last question — show the winner.");
  return commit(b.event, expected, questionWrite(b.stage, q + 1, Date.now(), b.game.config.answer_s));
}

export async function finishAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "finish");
  if ("ok" in b) return b;
  return commit(b.event, expected, overWrite(b.stage, currentQuestion(b.stage) ?? 0));
}

export async function drawAction(token: string, expected: number, mode: "one" | "all"): Promise<HostResult> {
  const b = await begin(token, expected, "draw");
  if ("ok" in b) return b;
  const game = b.game;
  if (game?.kind !== "draw" || !b.stage.run_id || !game.config.checkpoint_id) return fail("Pick a checkpoint for this draw in admin first.");
  forgetPool(game.id);
  const winners = await listWinners(game.id);
  const prize = nextPrize(prizeProgress(game.config.prizes, winners));
  if (!prize) return fail("Every prize has been drawn.");
  const pool = await poolFor(b.event, game, prize.prize_no);
  const count = drawCount(prize, mode === "all" ? "all" : "one", pool.length);
  if (count === 0) return fail("No one left to draw. Check the checkpoint and the categories left out.");
  const picked = await drawSpin({
    eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, prizeNo: prize.prize_no, count,
    checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories,
    spinEndsAt: new Date(Date.now() + SPIN_MS).toISOString(),
  });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

export async function presentAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "present");
  if ("ok" in b) return b;
  return commit(b.event, expected, drawReadyWrite(b.stage));
}

/**
 * "Not here — redraw" (D281): the winner is voided, kept on record, and one replacement is drawn
 * for the same prize. The voided person is out of that prize's pool (draw_spin), so the redraw
 * never lands on them again. After "Draw all", the prize's other winners stay on the stage ahead
 * of the replacement (draw_spin's p_keep), so any of them can be sent away in turn; the LED
 * reveals them all again. With no one left to draw, the stage goes back to the reveal of the
 * others (or to the ready screen when there are none). Only a name the stage itself drew can be
 * voided, so the caller cannot void anyone else.
 */
export async function redrawAction(token: string, expected: number, attendeeId: string): Promise<HostResult> {
  const b = await begin(token, expected, "redraw");
  if ("ok" in b) return b;
  const game = b.game;
  const spun = spinFacts(b.stage);
  if (game?.kind !== "draw" || !spun || !isId(attendeeId) || !spun.winnerIds.includes(attendeeId) || !b.stage.run_id || !game.config.checkpoint_id) return STALE;
  await voidWinner(game.id, attendeeId);
  forgetPool(game.id);
  const keep = spun.winnerIds.filter((id) => id !== attendeeId);
  const pool = await poolFor(b.event, game, spun.prizeNo);
  if (pool.length === 0) {
    const back = keep.length > 0 ? drawRevealWrite(b.stage, spun.prizeNo, keep) : drawReadyWrite(b.stage);
    return commit(b.event, expected, back, "Marked as not here. No one is left to draw for this prize.");
  }
  const picked = await drawSpin({
    eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, prizeNo: spun.prizeNo, count: 1,
    checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories,
    spinEndsAt: new Date(Date.now() + SPIN_MS).toISOString(), keep,
  });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

export async function idleAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "idle");
  if ("ok" in b) return b;
  return commit(b.event, expected, idleWrite());
}
