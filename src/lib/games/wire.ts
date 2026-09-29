import type { DrawFormat, GameKind } from "@/lib/games/config";
import type { Background } from "@/lib/games/background";
import type { CardView } from "@/lib/games/cards";
import type { PrizeProgress } from "@/lib/games/draw";
import type { HostAction } from "@/lib/games/phase";
import type { PublicStage } from "@/lib/games/views";

/** What a phone knows about itself in the game on stage. No tap counts (D304). */
export type PhoneMe =
  | { kind: "race"; joined: boolean; lane: string; place: number | null; lanes: number }
  | { kind: "survival"; joined: boolean; outAt: number | null; answered: number | null }
  /** `up`: drawn in a card round and called to the stage to pick a card (D319). */
  | { kind: "draw"; won: string | null; up: boolean }
  | { kind: "none" };

/** GET /api/play/[token]/state. `unchanged` means "same key as you sent", and nothing else is sent. */
export type PhoneState = { now: number; key: string; unchanged?: true; stage?: PublicStage; me?: PhoneMe };

/** A tile on the LED: initials plus first name (D273). */
export type Person = { id: string; initials: string; first: string };

/**
 * A race lane on the LED. `progress` (0–1) replaces the score (D304); `initials` are the lane's
 * latest joiners, only in the lobby (D305).
 */
export type DisplayLane = { key: string; label: string; players: number; progress: number; place: number; initials: string[] };

/** The lucky draw on the LED (D310–D319). */
export type DisplayDraw = {
  format: DrawFormat;
  prize: string | null;
  /** The current or next prize's picture, beside `prize` (D323). */
  prizeImage: string | null;
  pool: number;
  sample: Person[];
  /** During draw_spinning, and a card round's draw_card_landed: who the reels or the wheel land on (D312). */
  targets: Person[] | null;
  spinMs: number | null;
  /** A "Not here" redraw's quick reel (D318). */
  quick: boolean;
  /** Wheel format: every slice, the frozen pool in id order (D314, D316). */
  wheel: Person[] | null;
  /** Mosaic format, in draw_rounds: the frozen pool, and who stands after this round (D315). */
  mosaic: { people: Person[]; survivorIds: string[]; round: number; rounds: number } | null;
  /** The game's card back (D317, D323), whichever format is running. */
  cardBack: string | null;
  /** Card round (D317). */
  cards: { slots: CardView[]; participant: { name: string; company: string } | null; picked: number | null } | null;
  /** Only in draw_reveal (D280). */
  winners: { name: string; company: string }[] | null;
};

/** GET /api/display/[token]/state — the full view on every poll (D260). */
export type DisplayState = {
  now: number;
  stage: PublicStage;
  event: { name: string; logoUrl: string | null; colour: string };
  /** The LED background of the game on stage; Theme when idle (D297, D298). */
  look: Background;
  /**
   * `players` is everyone who joined; `more` is the lanes the lobby leaves off (D364). While racing
   * every lane is sent and the LED picks its columns (heldLanes).
   */
  race: { lanes: DisplayLane[]; players: number; more: number; solo: boolean; mvp: { name: string } | null } | null;
  survival: {
    players: Person[];
    eliminatedIds: string[];
    answered: number;
    split: number[] | null;
    winners: { name: string; company: string }[];
  } | null;
  draw: DisplayDraw | null;
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
    format: DrawFormat;
    /** Card round: cards not yet taken in this run. Null for the other formats. */
    cardsLeft: number | null;
  } | null;
};
