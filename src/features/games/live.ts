import "server-only";
import type { Attendee, Event } from "@/lib/types";
import { getEvent, getEventByDisplayToken, getEventByHostToken } from "@/lib/db/events";
import { getAttendeeByToken, getGame, getRun, getStage, listRoster, listTaps, type Run } from "./db";
import type { Game } from "./config";
import { createMemo } from "./memo";
import { resolveStage, type StageRow } from "./phase";
import type { TapRow } from "./race";
import { isValidToken } from "@/lib/tokens";
import { isUnpublished } from "@/lib/portal";
import { crewLinkLive } from "@/lib/crew";
import { nowInKL } from "@/lib/time";

/*
 * Per-instance memos (D259). The stage is shared by every phone at the event, so it is read at
 * most once a second per server instance; the rest change rarely or not at all during a game.
 * A host write clears the stage on the instance that made it (forgetStage); other instances
 * catch up within the second.
 */
const stageMemo = createMemo<StageRow>(1000);
const gameMemo = createMemo<Game | null>(5000);
const runMemo = createMemo<Run | null>(60_000);
const tapsMemo = createMemo<TapRow[]>(250);
const rosterMemo = createMemo<Map<string, Attendee>>(10_000);
const attendeeMemo = createMemo<Attendee | null>(30_000);
const eventMemo = createMemo<Event | null>(10_000);

/** The stage as it stands now, and the game on it (only ever this event's game). */
export async function liveStage(eventId: string, now: number): Promise<{ stage: StageRow; game: Game | null }> {
  const raw = await stageMemo.get(eventId, () => getStage(eventId));
  const stage = resolveStage(raw, now);
  const gameId = stage.game_id;
  const game = gameId ? await gameMemo.get(gameId, () => getGame(gameId, eventId)) : null;
  return { stage, game };
}

export function forgetStage(eventId: string) {
  stageMemo.clear(eventId);
}

/**
 * A run, only if it is this event's. The stage's run_id is already checked by game_stage_write,
 * but runs are looked up by id alone, so the event is checked again here rather than trusted.
 */
export async function runFor(runId: string, eventId: string): Promise<Run | null> {
  const run = await runMemo.get(runId, () => getRun(runId));
  return run && run.event_id === eventId ? run : null;
}

export const tapsFor = (runId: string) => tapsMemo.get(runId, () => listTaps(runId));
export const rosterFor = (eventId: string) =>
  rosterMemo.get(eventId, async () => new Map((await listRoster(eventId)).map((a) => [a.id, a])));

export type PlayContext = { event: Event; attendee: Attendee };

/**
 * A phone's personal link → who and which event. The event is the attendee's own, never one
 * named by the caller. Null for a malformed or unknown token, a draft event, or an archived one.
 * A rotated attendee token keeps working for up to 30 s on an instance that had it memoised —
 * acceptable for a game, and the portal itself is not memoised.
 */
export async function playContext(token: string): Promise<PlayContext | null> {
  if (!isValidToken(token)) return null;
  const attendee = await attendeeMemo.get(token, () => getAttendeeByToken(token));
  if (!attendee) return null;
  const event = await eventMemo.get(attendee.event_id, () => getEvent(attendee.event_id));
  if (!event || isUnpublished(event) || event.status === "archived") return null;
  return { event, attendee };
}

export type LinkState = { event: Event } | { refused: "missing" | "expired" | "draft" };

async function byLink(token: string, kind: "host" | "display"): Promise<LinkState> {
  if (!isValidToken(token)) return { refused: "missing" };
  const lookup = kind === "host" ? getEventByHostToken : getEventByDisplayToken;
  const event = await eventMemo.get(`${kind}:${token}`, () => lookup(token));
  if (!event) return { refused: "missing" };
  if (isUnpublished(event)) return { refused: "draft" };
  // The crew link's rule (D252): closed a day after the event ends, and when archived.
  if (!crewLinkLive(event, nowInKL().date)) return { refused: "expired" };
  return { event };
}

export const hostLinkState = (token: string) => byLink(token, "host");
export const displayLinkState = (token: string) => byLink(token, "display");
