import "server-only";
import type { PlayContext } from "@/features/games";
import { tagsFor } from "@/features/games/client";
import { createMemo } from "@/lib/memo";
import { eventAddress } from "@/features/domains";
import { genericLink } from "@/lib/links";
import { nowInKL } from "@/lib/time";
import { boardSize, getPlayer, getSettings, listBoard, listFinalists, rankOf, runOffsets, type BoardRow } from "./db";
import { BOARD_TOP, aroundWindow, boardSlices, needsFreshSlice, type BoardEntry } from "./board";
import { ineligibility, phaseOf, type Ineligible, type Phase, type QualifierSettings } from "./phase";
import { streakDays, streakDots, tierOf, unlockedSkins, type SkinId, type Tier } from "./progress";
import { FINALISTS } from "./scoring";

// The qualifier page's state in one read (D771). Board rows are shared by everyone at the event,
// so they are read at most once per few seconds per server instance (createMemo, as the live
// games do, D259); the player's own rows are read fresh.
const BOARD_TTL_MS = 3000;
const boardMemo = createMemo<{ top: BoardRow[]; total: number }>(BOARD_TTL_MS);
const aroundMemo = createMemo<BoardRow[]>(BOARD_TTL_MS);
const settingsMemo = createMemo<QualifierSettings | null>(BOARD_TTL_MS);
// The event's own address changes about never; every submit builds a view, so it is read once a minute.
const shareMemo = createMemo<string>(60_000);
const shareUrlFor = (event: { id: string; slug: string }) =>
  shareMemo.get(event.id, async () => genericLink(await eventAddress(event)));

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

export type QualifierView = {
  phase: Phase;
  opensAt: string | null;
  closesAt: string | null;
  ineligible: Ineligible | null;
  /** The event's own link for the share text: never the player's personal one (D774). */
  shareUrl: string;
  me: {
    best: number | null;
    accuracy: number | null;
    rank: number | null;
    total: number;
    tier: Tier;
    streak: number;
    /** One dot per day of the window (at most the last 7), filled when the player ran that day. */
    dots: { day: string; done: boolean }[];
    skins: SkinId[];
    skin: SkinId | null;
    runs: number;
    dropped: { from: number; to: number | null } | null;
  };
  /** The #10 player's best wpm, the finale cut line; null with fewer than 10 ranked. */
  cutWpm: number | null;
  /** True or false once the finalists are confirmed; null before. */
  finalist: boolean | null;
  board: { top: BoardEntry[]; around: BoardEntry[] };
};

/** Fell out of place since the rank last seen: lower on the board, or off it. */
export function droppedOf(seen: number | null, rank: number | null): { from: number; to: number | null } | null {
  if (seen === null) return null;
  return rank === null || rank > seen ? { from: seen, to: rank } : null;
}

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

  const [player, rank, board0, finalists, shareUrl] = await Promise.all([
    getPlayer(event.id, attendee.id),
    // Someone who may not play is off the board whatever their old runs say.
    ineligible ? Promise.resolve(null) : known ? Promise.resolve(known.rank) : rankOf(event.id, attendee.id),
    boardFor(event.id),
    phase === "confirmed" ? listFinalists(event.id) : Promise.resolve(null),
    shareUrlFor(event),
  ]);
  let board = board0;
  let aroundRows = rank !== null && rank > BOARD_TOP ? await aroundFor(event.id, rank) : [];

  const seen = (r: BoardRow) => ({ rank: r.rank, id: r.attendee_id, wpm: r.best_wpm });
  const stale = needsFreshSlice({
    top: board.top.map(seen), around: aroundRows.map(seen), myId: attendee.id, myRank: rank,
    myWpm: player?.best_wpm ?? null, total: board.total,
  });
  if (stale.board) board = await boardFor(event.id, true);
  if (stale.around && rank !== null) aroundRows = await aroundFor(event.id, rank, true);

  // Top and around are disjoint by rank (around starts at 21), so a person can't appear twice.
  const rows = new Map<number, BoardRow>();
  for (const r of [...board.top, ...aroundRows]) rows.set(r.rank, r);
  const tags = tagsFor([...rows.values()].map((r) => ({ id: r.attendee_id, name: r.name, extra: r.extra })));
  const entries: BoardEntry[] = [...rows.values()].map((r) => ({
    rank: r.rank,
    label: tags.get(r.attendee_id)?.label ?? r.name,
    skin: r.skin,
    wpm: r.best_wpm,
    me: r.attendee_id === attendee.id,
  }));

  const today = nowInKL(new Date(now)).date;
  const days = player?.run_days ?? [];
  const streak = streakDays(days, today);
  const best = player?.best_wpm ?? null;

  return {
    phase,
    opensAt: settings?.opens_at ?? null,
    closesAt: settings?.closes_at ?? null,
    ineligible,
    shareUrl,
    me: {
      best,
      accuracy: player?.best_accuracy ?? null,
      rank,
      total: board.total,
      tier: tierOf(best),
      streak,
      dots: streakDots(settings?.opens_at ?? null, settings?.closes_at ?? null, today, days),
      skins: unlockedSkins({ runs: player?.runs_played ?? 0, streak, best }),
      skin: player?.skin ?? null,
      runs: player?.runs_played ?? 0,
      dropped: ineligible ? null : droppedOf(player?.last_seen_rank ?? null, rank),
    },
    cutWpm: board.top.length >= FINALISTS ? board.top[FINALISTS - 1].best_wpm : null,
    finalist: finalists ? finalists.some((f) => f.attendee_id === attendee.id) : null,
    board: boardSlices(entries, rank),
  };
}

const ghostMemo = createMemo<number[] | null>(60_000);

/**
 * A run's word times for a ghost. A run's offsets never change once it is done, so the cut
 * line's run, which every starting phone asks for, is read once a minute per instance.
 */
export const ghostFor = (runId: string, eventId: string) =>
  ghostMemo.get(`${eventId}:${runId}`, () => runOffsets(runId, eventId));

/**
 * The ghosts a run starts with (D771): the player's own best run, and the #10 player's best run
 * as the cut line. The cut is left out with fewer than 10 ranked, or when the player is #10.
 */
export async function ghostsFor(eventId: string, attendeeId: string): Promise<{ best: number[] | null; cut: number[] | null }> {
  const [player, board] = await Promise.all([getPlayer(eventId, attendeeId), boardFor(eventId)]);
  const tenth = board.top.length >= FINALISTS ? board.top[FINALISTS - 1] : null;
  const [best, cut] = await Promise.all([
    player?.best_run_id ? runOffsets(player.best_run_id, eventId) : Promise.resolve(null),
    tenth && tenth.attendee_id !== attendeeId ? ghostFor(tenth.best_run_id, eventId) : Promise.resolve(null),
  ]);
  return { best, cut };
}
