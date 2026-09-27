import type { GameKind } from "@/lib/games/config";
import type { PrizeProgress } from "@/lib/games/draw";
import type { HostAction } from "@/lib/games/phase";
import type { PublicStage } from "@/lib/games/views";

/** What a phone knows about itself in the game on stage. */
export type PhoneMe =
  | { kind: "race"; joined: boolean; lane: string; taps: number; place: number | null; lanes: number }
  | { kind: "survival"; joined: boolean; outAt: number | null; answered: number | null }
  | { kind: "draw"; won: string | null }
  | { kind: "none" };

/** GET /api/play/[token]/state. `unchanged` means "same key as you sent", and nothing else is sent. */
export type PhoneState = { now: number; key: string; unchanged?: true; stage?: PublicStage; me?: PhoneMe };

/** A tile on the LED: initials plus first name (D273). */
export type Person = { id: string; initials: string; first: string };

export type DisplayLane = { key: string; label: string; players: number; taps: number; score: number; place: number };

/** GET /api/display/[token]/state — the full view on every poll (D260). */
export type DisplayState = {
  now: number;
  stage: PublicStage;
  event: { name: string; logoUrl: string | null; colour: string };
  race: { lanes: DisplayLane[]; solo: boolean; mvp: { name: string; taps: number } | null } | null;
  survival: {
    players: Person[];
    eliminatedIds: string[];
    answered: number;
    split: number[] | null;
    winners: { name: string; company: string }[];
  } | null;
  draw: {
    prize: string | null;
    pool: number;
    sample: Person[];
    /** Only in draw_reveal (D280). */
    winners: { name: string; company: string }[] | null;
  } | null;
};

export type HostGame = { id: string; kind: GameKind; title: string; summary: string };

/** GET /api/host/[token]/state — the LED's view plus what only the host sees. */
export type HostState = DisplayState & {
  version: number;
  actions: HostAction[];
  games: HostGame[];
  /** Attendee fields a race can be grouped by. */
  fields: { key: string; label: string }[];
  /** The running race's grouping, for "Run again". */
  grouping: { by: string; key?: string; label?: string } | null;
  hostDraw: {
    progress: PrizeProgress[];
    /** Shown to the host as soon as the draw is made (D281). */
    spinWinners: { id: string; name: string; company: string }[];
    checkpointSet: boolean;
  } | null;
};
