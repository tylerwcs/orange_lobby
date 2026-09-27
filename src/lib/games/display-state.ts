import "server-only";
import type { Attendee, Event } from "@/lib/types";
import { gameSummary, type DrawGame, type Game, type SurvivalGame } from "@/lib/games/config";
import { allowedActions, currentQuestion, spinFacts, type StageRow } from "@/lib/games/phase";
import { laneLabel, standings, topTapper, visibleLanes } from "@/lib/games/race";
import { answerSplit, inGoingInto, outAt, stillIn } from "@/lib/games/survival";
import { eligiblePool, nextPrize, prizeProgress, standingWinners } from "@/lib/games/draw";
import { seededOrder } from "@/lib/games/mosaic";
import { tag, tagLabel } from "@/lib/games/names";
import { createMemo } from "@/lib/games/memo";
import { publicStage } from "@/lib/games/views";
import type { DisplayState, HostState, Person } from "@/lib/games/wire";
import { fieldValue } from "@/lib/attendee-values";
import { eventFields } from "@/lib/attendee-fields";
import { listAnswerChoices, listCheckedInIds, listEventWinners, listGames, listPlayers, listWinners } from "@/lib/db/games";
import { liveStage, rosterFor, runFor, tapsFor } from "@/lib/games/live";

const poolMemo = createMemo<Attendee[]>(3000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The draw's eligible pool (D278), for the host's count and the LED's rolling names. Only this
 * event's attendees can be in it: the roster is the event's, and check-ins are read for this
 * event. Categories follow the multi-programme rule in `eligiblePool` (one excluded part is
 * enough), as draw_spin does.
 */
export function poolFor(event: Event, game: DrawGame): Promise<Attendee[]> {
  return poolMemo.get(game.id, async () => {
    const { checkpoint_id, exclude_categories } = game.config;
    // A checkpoint id the admin form let through but that is not an id at all reads as unset,
    // rather than failing the whole LED and host view on a query error.
    if (!checkpoint_id || !UUID.test(checkpoint_id)) return [];
    const [roster, checkedIn, winners] = await Promise.all([
      rosterFor(event.id), listCheckedInIds(event.id, checkpoint_id), listEventWinners(event.id),
    ]);
    return eligiblePool([...roster.values()], checkedIn, exclude_categories, standingWinners(winners));
  });
}

export function forgetPool(gameId: string) {
  poolMemo.clear(gameId);
}

const person = (id: string, name: string): Person => ({ id, ...tag(name) });
/** Winner cards are the one place with the full name and company (D273). */
const card = (a: Attendee | undefined) => ({ name: a?.name ?? "", company: a ? fieldValue(a, "company") : "" });

type Live = { stage: StageRow; game: Game | null };

/** The LED's full view, every poll (D260). */
export async function displayState(event: Event, now: number): Promise<DisplayState> {
  return displayFor(event, now, await liveStage(event.id, now));
}

/**
 * Built from one stage read, so the host's version and actions always describe the stage the
 * view shows (the host's next write is a compare-and-set against that version).
 */
async function displayFor(event: Event, now: number, { stage, game }: Live): Promise<DisplayState> {
  const base: DisplayState = {
    now, stage: publicStage(stage, game, now),
    event: { name: event.name, logoUrl: event.logo_url, colour: event.primary_color },
    race: null, survival: null, draw: null,
  };
  if (!game || !stage.run_id || stage.game_id !== game.id) return base;
  if (game.kind === "tap_race") return { ...base, race: await raceView(event, stage) };
  if (game.kind === "survival") return { ...base, survival: await survivalView(event, stage, game) };
  return { ...base, draw: await drawView(event, stage, game) };
}

async function raceView(event: Event, stage: StageRow): Promise<DisplayState["race"]> {
  const runId = stage.run_id!;
  const [run, rows, roster] = await Promise.all([runFor(runId, event.id), tapsFor(runId), rosterFor(event.id)]);
  const grouping = run?.grouping ?? { by: "solo" as const };
  const nameOf = (id: string) => roster.get(id)?.name ?? "";
  const table = standings(rows);
  const shown = stage.phase === "race_results" ? table : visibleLanes(table, grouping);
  const top = topTapper(rows);
  return {
    lanes: shown.map((l) => ({ key: l.key, label: laneLabel(l.key, grouping, nameOf), players: l.players, taps: l.taps, score: l.score, place: l.place })),
    solo: grouping.by === "solo",
    mvp: stage.phase === "race_results" && top ? { name: tagLabel(nameOf(top.attendee_id)), taps: top.taps } : null,
  };
}

async function survivalView(event: Event, stage: StageRow, game: SurvivalGame): Promise<DisplayState["survival"]> {
  const runId = stage.run_id!;
  const [rows, roster] = await Promise.all([listPlayers(runId), rosterFor(event.id)]);
  const nameOf = (id: string) => roster.get(id)?.name ?? "";
  const q = currentQuestion(stage);
  const ids = stage.phase === "survival_lobby" ? rows.map((r) => r.attendee_id)
    : stage.phase === "survival_over" || q === null ? stillIn(rows)
    : inGoingInto(rows, q);
  const counting = q !== null && ["survival_question", "survival_locked", "survival_reveal"].includes(stage.phase);
  const choices = counting ? await listAnswerChoices(runId, q) : [];
  const optionCount = q === null ? 0 : game.config.questions[q]?.options.length ?? 0;
  return {
    players: ids.map((id) => person(id, nameOf(id))),
    eliminatedIds: stage.phase === "survival_reveal" && q !== null ? outAt(rows, q) : [],
    answered: choices.length,
    split: stage.phase === "survival_locked" || stage.phase === "survival_reveal" ? answerSplit(choices, optionCount) : null,
    winners: stage.phase === "survival_over" ? stillIn(rows).map((id) => card(roster.get(id))) : [],
  };
}

async function drawView(event: Event, stage: StageRow, game: DrawGame): Promise<DisplayState["draw"]> {
  const [winners, pool, roster] = await Promise.all([listWinners(game.id), poolFor(event, game), rosterFor(event.id)]);
  const spun = spinFacts(stage);
  const prizeNo = spun?.prizeNo ?? nextPrize(prizeProgress(game.config.prizes, winners))?.prize_no ?? null;
  return {
    prize: prizeNo === null ? null : game.config.prizes[prizeNo]?.name ?? null,
    pool: pool.length,
    sample: seededOrder(pool, `${stage.run_id}:${stage.version}`).slice(0, 40).map((a) => person(a.id, a.name)),
    // Never before the reveal: the winner is not on the wire while the names are still rolling (D280).
    winners: stage.phase === "draw_reveal" && spun ? spun.winnerIds.map((id) => card(roster.get(id))) : null,
  };
}

/** The LED's view plus what only the host sees (D260, D281). */
export async function hostState(event: Event, now: number): Promise<HostState> {
  const live = await liveStage(event.id, now);
  const { stage, game } = live;
  const [display, games] = await Promise.all([displayFor(event, now, live), listGames(event.id)]);
  let hostDraw: HostState["hostDraw"] = null;
  if (game?.kind === "draw" && stage.game_id === game.id) {
    const [winners, roster] = await Promise.all([listWinners(game.id), rosterFor(event.id)]);
    const spun = spinFacts(stage);
    hostDraw = {
      progress: prizeProgress(game.config.prizes, winners),
      spinWinners: spun && (stage.phase === "draw_spinning" || stage.phase === "draw_reveal")
        ? spun.winnerIds.map((id) => ({ id, ...card(roster.get(id)) }))
        : [],
      checkpointSet: game.config.checkpoint_id !== null,
    };
  }
  const run = stage.run_id && game?.kind === "tap_race" ? await runFor(stage.run_id, event.id) : null;
  return {
    ...display,
    version: stage.version,
    actions: allowedActions(stage.phase),
    games: games.map((g) => ({ id: g.id, kind: g.kind, title: g.title, summary: gameSummary(g) })),
    fields: eventFields(event.registration_questions, event.attendee_fields).map((f) => ({ key: f.key, label: f.label })),
    grouping: run ? run.grouping : null,
    hostDraw,
  };
}
