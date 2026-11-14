import "server-only";
import type { PlayContext } from "@/features/games";
import { tagsFor } from "@/features/games/client";
import { createMemo } from "@/lib/memo";
import { boardSize, getPlayer, getSettings, listBoard, rankOf, usedSince, type BoardRow } from "./db";
import { klDay, klDayStart, type PlayHours } from "./hours";
import { BOARD_TOP, aroundWindow, boardSlices, needsFreshSlice, type BoardEntry } from "./board";
import { ineligibility, phaseOf, type Ineligible, type Phase, type QualifierSettings } from "./phase";

// Slime Splat's page state in one read (D771, D795, D797). Board rows are shared by everyone at the
// event, so they are read at most once per few seconds per server instance (createMemo, as the
// live games do, D259); the player's own rows are read fresh.
const BOARD_TTL_MS = 3000;
const boardMemo = createMemo<{ top: BoardRow[]; total: number }>(BOARD_TTL_MS);
const aroundMemo = createMemo<BoardRow[]>(BOARD_TTL_MS);
const settingsMemo = createMemo<QualifierSettings | null>(BOARD_TTL_MS);

/** The event's window and left-out categories, memoised for a few seconds like the board. */
export const settingsFor = (eventId: string) => settingsMemo.get(eventId, () => getSettings(eventId));

const loadBoard = async (eventId: string) => {
  const [top, total] = await Promise.all([listBoard(eventId, BOARD_TOP, 0), boardSize(eventId)]);
  return { top, total };
};

/** The first 20 rows and the board's size. `fresh` drops the shared copy and reads again. */
export const boardFor = (eventId: string, fresh = false) => {
  if (fresh) boardMemo.clear(eventId);
  return boardMemo.get(eventId, () => loadBoard(eventId));
};

/** Ranks myRank-1 .. myRank+1, never reaching into the top 20 (those rows are in `boardFor`). */
const aroundFor = (eventId: string, myRank: number, fresh = false) => {
  const key = `${eventId}:${myRank}`;
  if (fresh) aroundMemo.clear(key);
  const w = aroundWindow(myRank);
  return aroundMemo.get(key, () => listBoard(eventId, w.limit, w.offset));
};

type Person = { id: string; name: string; extra: Record<string, unknown> | null };

export type QualifierView = {
  phase: Phase;
  opensAt: string | null;
  closesAt: string | null;
  ineligible: Ineligible | null;
  me: { best: number | null; rank: number | null; total: number; runs: number };
  board: { top: BoardEntry[]; around: BoardEntry[] };
  /** Runs of each kind allowed a day (D907). No practice (null or 0): one kind of run, one Play (D913). */
  limits: { practice: number | null; official: number | null };
  /** What this attendee has started on `day` (the Malaysia date this was read on). */
  used: { day: string; practice: number; official: number };
  /** The hours of the Malaysia day a run may start in (D908). Null: any time. */
  playHours: PlayHours;
};

/**
 * `known` is a rank the caller has just read (the submit route's), so it is not read twice.
 * The shared board copy may be a few seconds old, so the caller's own row is reconciled with
 * their fresh rank (needsFreshSlice): only when it disagrees is that slice read again, and the
 * shared copy is refreshed with it for everyone after.
 */
export async function qualifierView(ctx: PlayContext, now: number, known?: { rank: number | null }): Promise<QualifierView> {
  const { event, attendee } = ctx;
  const settings = await settingsFor(event.id);
  const phase = phaseOf(settings, now);
  const ineligible = ineligibility({ ...attendee, cancelled_at: attendee.cancelled_at ?? null }, event.preview_attendee_id, settings?.excluded_categories ?? []);

  const limits = { practice: settings?.practice_per_day ?? null, official: settings?.official_per_day ?? null };
  const counted = limits.practice !== null || limits.official !== null;
  const [player, rank, board0, used] = await Promise.all([
    getPlayer(event.id, attendee.id),
    // Someone who may not play is off the board whatever their old runs say.
    ineligible ? Promise.resolve(null) : known ? Promise.resolve(known.rank) : rankOf(event.id, attendee.id),
    boardFor(event.id),
    // Only an event with daily limits needs today's counts.
    counted ? usedSince(event.id, attendee.id, new Date(klDayStart(now)).toISOString()) : Promise.resolve({ practice: 0, official: 0 }),
  ]);
  let board = board0;
  const aroundRank = rank !== null && rank > BOARD_TOP ? rank : null;
  let aroundRows = aroundRank !== null ? await aroundFor(event.id, aroundRank) : [];

  const seen = (r: BoardRow) => ({ rank: r.rank, id: r.attendee_id, score: r.best_score });
  const stale = needsFreshSlice({
    top: board.top.map(seen), around: aroundRows.map(seen), myId: attendee.id, myRank: rank,
    myScore: player?.best_score ?? null, total: board.total,
  });
  if (stale.board) board = await boardFor(event.id, true);
  if (stale.around && aroundRank !== null) aroundRows = await aroundFor(event.id, aroundRank, true);

  // Top and around are disjoint by rank (around starts at 21), so a person can't appear twice.
  const rows = new Map<number, BoardRow>();
  for (const r of [...board.top, ...aroundRows]) rows.set(r.rank, r);
  // One naming pass over everyone drawn, so two people who read alike are told apart.
  const people: Person[] = [...rows.values()].map((r) => ({ id: r.attendee_id, name: r.name, extra: r.extra }));
  const tags = tagsFor(people);
  const entries: BoardEntry[] = [...rows.values()].map((r) => ({
    rank: r.rank, label: tags.get(r.attendee_id)?.label ?? r.name, score: r.best_score, me: r.attendee_id === attendee.id,
  }));

  return {
    phase,
    opensAt: settings?.opens_at ?? null,
    closesAt: settings?.closes_at ?? null,
    ineligible,
    me: { best: player?.best_score ?? null, rank, total: board.total, runs: player?.runs_played ?? 0 },
    board: boardSlices(entries, rank),
    limits,
    used: { day: klDay(now), ...used },
    playHours: settings?.play_hours ?? null,
  };
}
