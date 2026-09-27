"use server";
import type { Event } from "@/lib/types";
import { MAX_CARDS, type Game } from "@/lib/games/config";
import { forgetStage, hostLinkState, liveStage, runFor } from "@/lib/games/live";
import { forgetPool, poolFor } from "@/lib/games/display-state";
import { cardPick, createRun, drawSpin, getGame, listWinners, revealQuestion, voidPendingCard, voidWinner, writeStage } from "@/lib/db/games";
import {
  canDo, canReveal, currentQuestion, drawExtra, drawReadyWrite, drawRevealWrite, idleWrite, lobbyWrite, overWrite, questionWrite,
  QUICK_SPIN_MS, raceStartWrite, raceStopWrite, revealFacts, roundWrite, spinFacts, type HostAction, type StageRow, type StageWrite,
} from "@/lib/games/phase";
import { cardsLeft, dealDeck, secureRandom } from "@/lib/games/cards";
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
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

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
  // A card round deals its deck now, from the prize units still to give (D317).
  let deck: number[] | null = null;
  if (game.kind === "draw" && game.config.format === "cards") {
    deck = dealDeck(prizeProgress(game.config.prizes, await listWinners(game.id)), secureRandom);
    if (deck.length === 0) return fail("Every prize in this draw has been given. Reset the draw in admin to deal again.");
    if (deck.length > MAX_CARDS) return fail(`A card round has at most ${MAX_CARDS} cards. Lower the prize quantities in admin.`);
  }
  const run = await createRun(game, lanes, deck);
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

/**
 * Draw (D279, D310–D317). Slot and wheel spin for the game's spin time; the wheel always draws
 * one. The mosaic draws the winners, then plays its rounds with no end time. A card round draws
 * one participant, with no prize until they pick a card, while cards are left.
 */
export async function drawAction(token: string, expected: number, mode: "one" | "all"): Promise<HostResult> {
  const b = await begin(token, expected, "draw");
  if ("ok" in b) return b;
  const game = b.game;
  const runId = b.stage.run_id;
  if (game?.kind !== "draw" || !runId || !game.config.checkpoint_id) return fail("Pick a checkpoint for this draw in admin first.");
  forgetPool(game.id);
  const format = game.config.format;
  const spinMs = game.config.spin_s * 1000;
  const base = { eventId: b.event.id, expected, runId, gameId: game.id, checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories };
  const winners = await listWinners(game.id);
  let picked: string[] | null;

  if (format === "cards") {
    const run = await runFor(runId, b.event.id);
    if (cardsLeft(run?.deck ?? [], winners, runId) === 0) return fail("All cards have been dealt.");
    if ((await poolFor(b.event, game, null, null, runId)).length === 0) return fail("No one left to draw. Check the checkpoint and the categories left out.");
    picked = await drawSpin({ ...base, prizeNo: null, count: 1, spinEndsAt: at(spinMs), extra: { cards: true, spin_ms: spinMs } });
  } else {
    const prize = nextPrize(prizeProgress(game.config.prizes, winners));
    if (!prize) return fail("Every prize has been drawn.");
    const pool = await poolFor(b.event, game, prize.prize_no);
    const count = drawCount(prize, format === "wheel" || mode !== "all" ? "one" : "all", pool.length);
    if (count === 0) return fail("No one left to draw. Check the checkpoint and the categories left out.");
    picked = format === "mosaic"
      ? await drawSpin({ ...base, prizeNo: prize.prize_no, count, spinEndsAt: null, phase: "draw_rounds", extra: { round: 0, rounds: game.config.rounds } })
      : await drawSpin({ ...base, prizeNo: prize.prize_no, count, spinEndsAt: at(spinMs), extra: { spin_ms: spinMs } });
  }
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

/** Next round of a mosaic draw (D315). The press after the last round reveals the winners. */
export async function roundAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "round");
  if ("ok" in b) return b;
  const w = roundWrite(b.stage);
  return w ? commit(b.event, expected, w) : STALE;
}

/** The host taps the card the participant called out (D317). */
export async function pickCardAction(token: string, expected: number, cardNo: number): Promise<HostResult> {
  const b = await begin(token, expected, "pick");
  if ("ok" in b) return b;
  const game = b.game;
  const spun = spinFacts(b.stage);
  if (game?.kind !== "draw" || !spun || spun.winnerIds.length !== 1 || !b.stage.run_id || !Number.isInteger(cardNo)) return STALE;
  const prize = await cardPick({ eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, attendeeId: spun.winnerIds[0], cardNo });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return prize === null ? fail("That card is taken, or someone else moved the game on. Showing the latest.") : { ok: true };
}

export async function presentAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "present");
  if ("ok" in b) return b;
  return commit(b.event, expected, drawReadyWrite(b.stage));
}

/**
 * "Not here — redraw" (D281, D318): the winner is voided, kept on record, and one replacement is
 * drawn for the same prize (or, in a card round, the same turn). The voided person is out of that
 * prize's pool (draw_spin), so the redraw never lands on them again. After "Draw all", the
 * prize's other winners stay on the stage ahead of the replacement (draw_spin's p_keep), so any of
 * them can be sent away in turn; the LED reveals them all again. With no one left to draw, the
 * stage goes back to the reveal of the others (or to the ready screen when there are none). Only a
 * name the stage itself drew can be voided, so the caller cannot void anyone else.
 */
export async function redrawAction(token: string, expected: number, attendeeId: string): Promise<HostResult> {
  const b = await begin(token, expected, "redraw");
  if ("ok" in b) return b;
  const game = b.game;
  const spun = spinFacts(b.stage);
  if (game?.kind !== "draw" || !spun || !isId(attendeeId) || !spun.winnerIds.includes(attendeeId) || !b.stage.run_id || !game.config.checkpoint_id) return STALE;
  const cards = drawExtra(b.stage).cards;
  // A card turn's row may have already picked between begin() and here (another console's
  // card_pick landed first): voidPendingCard only touches a row still pending (card_no and
  // prize_no both null), so a landed pick makes this a no-op rather than voiding their win.
  if (cards) await voidPendingCard(game.id, attendeeId);
  else await voidWinner(game.id, attendeeId);
  forgetPool(game.id);
  // A card round has one participant at a time, so there is nobody else to keep.
  const keep = cards ? [] : spun.winnerIds.filter((id) => id !== attendeeId);
  const pool = await poolFor(b.event, game, spun.prizeNo, null, b.stage.run_id);
  if (pool.length === 0) {
    const back = keep.length > 0 ? drawRevealWrite(b.stage, spun.prizeNo, keep) : drawReadyWrite(b.stage);
    return commit(b.event, expected, back, cards ? "Marked as not here. No one is left to draw." : "Marked as not here. No one is left to draw for this prize.");
  }
  // The wheel spins again; everything else rolls a quick reel for the replacement (D318).
  const wheel = game.config.format === "wheel";
  const ms = wheel ? game.config.spin_s * 1000 : QUICK_SPIN_MS;
  const picked = await drawSpin({
    eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, prizeNo: spun.prizeNo, count: 1,
    checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories,
    spinEndsAt: at(ms), keep, extra: { spin_ms: ms, quick: !wheel, ...(cards ? { cards: true } : {}) },
  });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

export async function idleAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "idle");
  if ("ok" in b) return b;
  const pending = b.stage.phase === "draw_card_pick" && b.game?.kind === "draw" ? spinFacts(b.stage)?.winnerIds ?? [] : [];
  const r = await commit(b.event, expected, idleWrite());
  // Only once the stage has really moved: a stale End must not void anyone (D318).
  if (r.ok && b.game) for (const id of pending) await voidPendingCard(b.game.id, id);
  if (b.game) forgetPool(b.game.id);
  return r;
}
