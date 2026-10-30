import "server-only";
import type { PlayContext } from "@/features/games";
import { tagsFor } from "@/features/games/client";
import { createMemo } from "@/lib/memo";
import { lastDays, nowInKL } from "@/lib/time";
import { boardSize, getPlayer, getSettings, listBoard, listFinalists, rankOf, runOffsets, type BoardRow } from "./db";
import { BOARD_TOP, boardSlices, type BoardEntry } from "./board";
import { ineligibility, phaseOf, type Ineligible, type Phase, type QualifierSettings } from "./phase";
import { streakDays, tierOf, unlockedSkins, type SkinId, type Tier } from "./progress";
import { FINALISTS } from "./scoring";

// The qualifier page's state in one read (D771). Board rows are shared by everyone at the event,
// so they are read at most once per few seconds per server instance (createMemo, as the live
// games do, D259); the player's own rows are read fresh.
const BOARD_TTL_MS = 3000;
const boardMemo = createMemo<{ top: BoardRow[]; total: number }>(BOARD_TTL_MS);
const aroundMemo = createMemo<BoardRow[]>(BOARD_TTL_MS);
const settingsMemo = createMemo<QualifierSettings | null>(BOARD_TTL_MS);

/** The event's window and left-out categories, memoised for a few seconds like the board. */
export const settingsFor = (eventId: string) => settingsMemo.get(eventId, () => getSettings(eventId));

/** The first 20 rows and the board's size. */
export const boardFor = (eventId: string) =>
  boardMemo.get(eventId, async () => {
    const [top, total] = await Promise.all([listBoard(eventId, BOARD_TOP, 0), boardSize(eventId)]);
    return { top, total };
  });

/** Ranks myRank-1 .. myRank+1: rank r sits at offset r-1. */
const aroundFor = (eventId: string, myRank: number) =>
  aroundMemo.get(`${eventId}:${myRank}`, () => listBoard(eventId, 3, Math.max(0, myRank - 2)));

export type QualifierView = {
  phase: Phase;
  opensAt: string | null;
  closesAt: string | null;
  ineligible: Ineligible | null;
  me: {
    best: number | null;
    accuracy: number | null;
    rank: number | null;
    total: number;
    tier: Tier;
    streak: number;
    runDays: string[];
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

export async function qualifierView(ctx: PlayContext, now: number): Promise<QualifierView> {
  const { event, attendee } = ctx;
  const settings = await settingsFor(event.id);
  const phase = phaseOf(settings, now);
  const ineligible = ineligibility(attendee, event.preview_attendee_id, settings?.excluded_categories ?? []);

  const [player, rank, board, finalists] = await Promise.all([
    getPlayer(event.id, attendee.id),
    // Someone who may not play is off the board whatever their old runs say.
    ineligible ? Promise.resolve(null) : rankOf(event.id, attendee.id),
    boardFor(event.id),
    phase === "confirmed" ? listFinalists(event.id) : Promise.resolve(null),
  ]);
  const aroundRows = rank !== null && rank > BOARD_TOP ? await aroundFor(event.id, rank) : [];

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
  const week = new Set(lastDays(today, 7));

  return {
    phase,
    opensAt: settings?.opens_at ?? null,
    closesAt: settings?.closes_at ?? null,
    ineligible,
    me: {
      best,
      accuracy: player?.best_accuracy ?? null,
      rank,
      total: board.total,
      tier: tierOf(best),
      streak,
      runDays: days.filter((d) => week.has(d)),
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
