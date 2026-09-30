import "server-only";
import type { Attendee, Event } from "@/lib/types";
import { gameSummary, type DrawGame, type Game, type SurvivalGame } from "@/lib/games/config";
import { allowedActions, currentQuestion, drawExtra, spinFacts, type StageRow } from "@/lib/games/phase";
import { laneLabel, lobbyLanes, progressOf, standings, topTapper } from "@/lib/games/race";
import { answerSplit, inGoingInto, outAt, stillIn } from "@/lib/games/survival";
import { absentFor, checkedInBy, eligiblePool, nextPrize, poolBeforeDraw, prizeProgress, standingWinners, type CheckinRow, type WinnerRow } from "@/lib/games/draw";
import { mosaicSurvivors, seededOrder } from "@/lib/games/mosaic";
import { backgroundOf } from "@/lib/games/background";
import { cardsLeft, cardsView } from "@/lib/games/cards";
import { tagsFor, type Tag } from "@/lib/games/names";
import { createMemo } from "@/lib/games/memo";
import { publicStage } from "@/lib/games/views";
import type { DisplayState, HostState, Person } from "@/lib/games/wire";
import { fieldValue } from "@/lib/attendee-values";
import { eventFields } from "@/lib/attendee-fields";
import { listAnswerChoices, listCheckins, listEventWinners, listGames, listPlayers, listWinners } from "@/lib/db/games";
import { liveStage, rosterFor, runFor, tapsFor } from "@/lib/games/live";

type PoolRows = { roster: Attendee[]; checkins: CheckinRow[]; winners: WinnerRow[] };
const poolMemo = createMemo<PoolRows>(3000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The draw's eligible pool (D278) for one prize, for the host's count and the LED's names.
 * Only this event's attendees can be in it: the roster is the event's, and check-ins are read
 * for this event. Categories follow the multi-programme rule in `eligiblePool`, as draw_spin
 * does. Whoever was "not here" for `prizeNo` stays out (absentFor); a card round's turn has no
 * prize, and its absentees are per run (mirroring draw_spin's `w.run_id = p_run_id` when the
 * prize is null): only voids from `runId`'s own run keep someone out, never a void from an
 * earlier run of the same card game. `at` freezes the check-ins at the draw (D316). The rows
 * are memoised per game; the filters apply on each call.
 */
export async function poolFor(event: Event, game: DrawGame, prizeNo: number | null, at: number | null = null, runId: string | null = null): Promise<Attendee[]> {
  const { checkpoint_id, exclude_categories } = game.config;
  // hydrateGame already reads a stored checkpoint that is not an id as unset; checked again here
  // so a bad value can never fail the whole LED and host view on a query error.
  if (!checkpoint_id || !UUID.test(checkpoint_id)) return [];
  const rows = await poolMemo.get(game.id, async () => {
    const [roster, checkins, winners] = await Promise.all([
      rosterFor(event.id), listCheckins(event.id, checkpoint_id), listEventWinners(event.id),
    ]);
    return { roster: [...roster.values()], checkins, winners };
  });
  const cards = game.config.format === "cards";
  const cardTurn = prizeNo === null && cards;
  const absent = prizeNo === null && !cards
    ? new Set<string>()
    : absentFor(cardTurn ? rows.winners.filter((w) => w.run_id === runId) : rows.winners, game.id, prizeNo);
  return eligiblePool(rows.roster, checkedInBy(rows.checkins, at), exclude_categories, standingWinners(rows.winners), absent);
}

export function forgetPool(gameId: string) {
  poolMemo.clear(gameId);
}

/** Everyone's LED name (D365), worked out once per roster read: rosterFor memoises the Map. */
const tagMemo = new WeakMap<Map<string, Attendee>, Map<string, Tag>>();
function tagsOf(roster: Map<string, Attendee>): Map<string, Tag> {
  let tags = tagMemo.get(roster);
  if (!tags) tagMemo.set(roster, (tags = tagsFor([...roster.values()])));
  return tags;
}
const UNKNOWN: Tag = { initials: "?", label: "?" };
const person = (id: string, tags: Map<string, Tag>): Person => ({ id, ...(tags.get(id) ?? UNKNOWN) });
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
    look: backgroundOf(game && stage.game_id === game.id ? game : null),
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
  const tags = tagsOf(roster);
  const labelOf = (id: string) => tags.get(id)?.label ?? "";
  const table = standings(rows);
  const lobby = stage.phase === "race_lobby";
  // The lobby shows the newest joiners; racing and results send every lane (D364).
  const shown = lobby ? lobbyLanes(table, rows) : table;
  const leader = Math.max(0, ...table.map((l) => l.score));
  // The lobby's initials: each lane's latest joiners, newest last (D305). listTaps pages by
  // attendee_id, so the join order is restored here by joined_at before taking the tail.
  const initials = (key: string) => lobby
    ? rows.filter((r) => r.lane_key === key)
        .sort((a, b) => (a.joined_at ?? "").localeCompare(b.joined_at ?? ""))
        .slice(-12)
        .map((r) => (tags.get(r.attendee_id) ?? UNKNOWN).initials)
    : [];
  const top = topTapper(rows);
  return {
    lanes: shown.map((l) => ({
      key: l.key, label: laneLabel(l.key, grouping, labelOf), players: l.players,
      progress: progressOf(l.score, leader), place: l.place, initials: initials(l.key),
    })),
    players: rows.length,
    more: table.length - shown.length,
    solo: grouping.by === "solo",
    // The name only (D304).
    mvp: stage.phase === "race_results" && top ? { name: labelOf(top.attendee_id) } : null,
  };
}

async function survivalView(event: Event, stage: StageRow, game: SurvivalGame): Promise<DisplayState["survival"]> {
  const runId = stage.run_id!;
  const [rows, roster] = await Promise.all([listPlayers(runId), rosterFor(event.id)]);
  const tags = tagsOf(roster);
  const q = currentQuestion(stage);
  const ids = stage.phase === "survival_lobby" ? rows.map((r) => r.attendee_id)
    : stage.phase === "survival_over" || q === null ? stillIn(rows)
    : inGoingInto(rows, q);
  const counting = q !== null && ["survival_question", "survival_locked", "survival_reveal"].includes(stage.phase);
  const choices = counting ? await listAnswerChoices(runId, q) : [];
  const optionCount = q === null ? 0 : game.config.questions[q]?.options.length ?? 0;
  return {
    players: ids.map((id) => person(id, tags)),
    eliminatedIds: stage.phase === "survival_reveal" && q !== null ? outAt(rows, q) : [],
    answered: choices.length,
    split: stage.phase === "survival_locked" || stage.phase === "survival_reveal" ? answerSplit(choices, optionCount) : null,
    winners: stage.phase === "survival_over" ? stillIn(rows).map((id) => card(roster.get(id))) : [],
  };
}

const people = (list: Attendee[], tags: Map<string, Tag>) => list.map((a) => person(a.id, tags));

async function drawView(event: Event, stage: StageRow, game: DrawGame): Promise<DisplayState["draw"]> {
  const [winners, roster] = await Promise.all([listWinners(game.id), rosterFor(event.id)]);
  const format = game.config.format;
  const spun = spinFacts(stage);
  const extra = drawExtra(stage);
  const prizeNo = spun ? spun.prizeNo : format === "cards" ? null : nextPrize(prizeProgress(game.config.prizes, winners))?.prize_no ?? null;
  const pool = await poolFor(event, game, prizeNo, extra.poolAt, stage.run_id);
  // While a spin or the mosaic's rounds run, the pool is the one the draw was made from, however
  // fresh the memo (see poolBeforeDraw). Only this spin's draw is added back. A card round's
  // landed reel is the same spin stopped: the same pool (and so the same sample, seeded on the
  // unchanged version) keeps the reel's other faces as they were when it stopped.
  const running = stage.phase === "draw_spinning" || stage.phase === "draw_rounds" || stage.phase === "draw_card_landed";
  const drawn = running && spun ? spun.newIds.flatMap((id) => { const a = roster.get(id); return a ? [a] : []; }) : [];
  const shown = poolBeforeDraw(pool, drawn);
  // Winner cards keep the full name (D273); every other name on the draw is the LED name (D365).
  const nameOf = (id: string) => roster.get(id)?.name ?? "";
  const tags = tagsOf(roster);

  const run = format === "cards" && stage.run_id ? await runFor(stage.run_id, event.id) : null;
  const landed = stage.phase === "draw_card_landed";
  const onStage = spun && (landed || stage.phase === "draw_card_pick" || stage.phase === "draw_card_reveal") ? spun.winnerIds[0] : null;

  return {
    format,
    prize: prizeNo === null ? null : game.config.prizes[prizeNo]?.name ?? null,
    prizeImage: prizeNo === null ? null : game.config.prizes[prizeNo]?.image ?? null,
    pool: shown.length,
    sample: people(seededOrder(shown, `${stage.run_id}:${stage.version}`).slice(0, 40), tags),
    // The display link learns who the reels land on when the spin starts (D312). Phones never do.
    // A card round's landed reel keeps showing its participant, public by then.
    targets: stage.phase === "draw_spinning" && spun ? spun.newIds.map((id) => person(id, tags))
      : landed && spun ? spun.winnerIds.slice(0, 1).map((id) => person(id, tags)) : null,
    spinMs: extra.spinMs,
    quick: extra.quick,
    wheel: format === "wheel" && (stage.phase === "draw_ready" || stage.phase === "draw_spinning") ? people(shown, tags) : null,
    mosaic: stage.phase === "draw_rounds" && spun && extra.round !== null && extra.rounds !== null
      ? {
        people: people(shown, tags),
        // Only who still stands this round: the winners cannot be picked out early (D315).
        survivorIds: mosaicSurvivors(shown.map((a) => a.id), spun.winnerIds, extra.round, extra.rounds, `${stage.run_id}:${spun.winnerIds.join(",")}`),
        round: extra.round,
        rounds: extra.rounds,
      }
      : null,
    cardBack: game.config.card_back,
    cards: format === "cards" && stage.run_id
      ? {
        slots: cardsView(run?.deck ?? [], winners, stage.run_id, game.config.prizes, nameOf),
        participant: onStage ? card(roster.get(onStage)) : null,
        picked: stage.phase === "draw_card_reveal" ? extra.cardNo : null,
      }
      : null,
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
    const run = game.config.format === "cards" && stage.run_id ? await runFor(stage.run_id, event.id) : null;
    const showing: ReadonlySet<string> = new Set(["draw_spinning", "draw_reveal", "draw_rounds", "draw_card_landed", "draw_card_pick", "draw_card_reveal"]);
    hostDraw = {
      progress: prizeProgress(game.config.prizes, winners),
      spinWinners: spun && showing.has(stage.phase) ? spun.winnerIds.map((id) => ({ id, ...card(roster.get(id)) })) : [],
      checkpointSet: game.config.checkpoint_id !== null,
      format: game.config.format,
      cardsLeft: run && stage.run_id ? cardsLeft(run.deck ?? [], winners, stage.run_id) : null,
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
