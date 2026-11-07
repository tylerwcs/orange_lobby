import type { ActivityKind } from "@/lib/types";
import type { GameKind } from "@/features/games/client";
import {
  ATTENDEES_OPTIONS, BOOKING_OPTIONS, CHECK_IN_OPTIONS, ENGAGEMENT_OPTIONS, GROUPS_OPTIONS, PORTAL_OPTIONS, REGISTRATION_OPTIONS,
  type Option,
} from "./options";

/** Always on for every event, never stored (D433, renamed from BASE_KEYS in D777). */
export const CORE_KEYS = ["portal", "attendees", "agenda", "info", "announcements", "exports", "registration", "check_in", "groups", "breakouts"] as const;
export type CoreKey = (typeof CORE_KEYS)[number];

/** What an event can add (D433). A key added here must be added to FEATURES: the Record stops the build until it is. */
export const ADDON_KEYS = ["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido", "typing_qualifier", "language", "popups", "custom"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];
export type FeatureKey = CoreKey | AddonKey;

/** Stored in `event_features`. `custom` never is: an event has it when it has a custom module (D436). */
export type StoredAddon = Exclude<AddonKey, "custom">;
export const STORED_ADDONS = ADDON_KEYS.filter((k): k is StoredAddon => k !== "custom");

/**
 * `core` is always on. `optional` is an add-on. `experimental` is an add-on built for one client and not yet
 * proven elsewhere: stored and switched like `optional`, only the lists flag it (D777).
 */
export type Tier = "core" | "optional" | "experimental";

/** Where a feature or option came from: the client event, the month it shipped (YYYY-MM) and its D-number (D777). */
export type Origin = { event?: string; date: string; decision?: string };

/** Sidebar items and settings parts an add-on can hide. Activities and Games are hidden by their kinds, not named here. */
export type NavKey = "whatsapp" | "activities" | "games" | "popups";
export type SettingsPartKey = "address" | "language" | "committee_alerts";

export type Unlocks = {
  nav?: readonly NavKey[];
  activityKinds?: readonly ActivityKind[];
  gameKinds?: readonly GameKind[];
  settingsParts?: readonly SettingsPartKey[];
};

export type Feature = { name: string; summary: string; tier: Tier; origin?: Origin; unlocks: Unlocks; options: readonly Option[] };

const core = (name: string, summary: string, options: readonly Option[] = []): Feature => ({ name, summary, tier: "core", unlocks: {}, options });
type AddonExtras = { unlocks?: Unlocks; options?: readonly Option[]; origin?: Origin; experimental?: true };
const addon = (name: string, summary: string, { unlocks = {}, options = [], origin, experimental }: AddonExtras = {}): Feature => ({
  name, summary, tier: experimental ? "experimental" : "optional", ...(origin && { origin }), unlocks, options,
});

/** The one place a feature's name, summary, options and what it opens in admin live (D433, D777). */
export const FEATURES: Record<FeatureKey, Feature> = {
  portal: core("Attendee portal and personal links", "Each attendee's own link to the portal.", PORTAL_OPTIONS),
  attendees: core("Attendee list", "Import and manage who is coming.", ATTENDEES_OPTIONS),
  agenda: core("Agenda", "Days and sessions."),
  info: core("Event info", "Info tabs, including the venue and its floor plan."),
  announcements: core("Announcements", "News for attendees, pinned or not."),
  exports: core("Exports", "Spreadsheets, links and QR codes."),
  registration: core("Self-registration", "A sign-up form with your own questions.", REGISTRATION_OPTIONS),
  check_in: core("Check-in", "Crew scanning, checkpoints and badges.", CHECK_IN_OPTIONS),
  groups: core("Groups", "Teams built from a column.", GROUPS_OPTIONS),
  breakouts: core("Breakout rooms", "Rounds and room assignment."),
  whatsapp: addon("WhatsApp messaging", "Send portal links and announcements by WhatsApp.", { unlocks: { nav: ["whatsapp"] } }),
  booking: addon("Session booking", "Time slots attendees book, with capacity.", { unlocks: { activityKinds: ["booking"], settingsParts: ["committee_alerts"] }, options: BOOKING_OPTIONS }),
  engagement: addon("Engagement activities", "Stamp passport, submissions, scored challenges, the polaroid wall and tournaments.", { unlocks: { activityKinds: ["submission", "passport", "polaroid", "tournament"] }, options: ENGAGEMENT_OPTIONS }),
  live_games: addon("Live games", "Tap race and Last one standing on the LED.", { unlocks: { gameKinds: ["tap_race", "survival"] } }),
  lucky_draw: addon("Lucky draw", "Slot machine, wheel, mosaic and card round.", { unlocks: { gameKinds: ["draw"] } }),
  custom_domain: addon("Custom domain", "The event on its own address.", { unlocks: { settingsParts: ["address"] } }),
  slido: addon("Slido embedding", "Slido inside the portal. Until the embed is built, use a link tile."),
  // The key keeps the game's first name (D767); it is Slime Splat, a game under Games (D797).
  typing_qualifier: addon("Slime Splat", "A slime-popping typing game attendees play on their phones, with a leaderboard.", { unlocks: { nav: ["games"] }, origin: { date: "2026-10", decision: "D767" } }),
  language: addon("Bahasa Malaysia portal", "An EN | BM switch on the attendee portal.", { unlocks: { settingsParts: ["language"] }, origin: { event: "MYBESTME", date: "2026-10", decision: "D736" }, experimental: true }),
  popups: addon("Portal popups", "Messages that pop up over the attendee portal.", { unlocks: { nav: ["popups"] }, origin: { event: "MYBESTME", date: "2026-10", decision: "D751" }, experimental: true }),
  custom: addon("Custom module", "Bespoke work, described per event."),
};

/** The activity kinds in the New activity menu's order (`ACTIVITY_KINDS`). A kind missing here stops the build. */
export const ACTIVITY_KIND_ORDER = ["booking", "submission", "passport", "polaroid", "tournament"] as const satisfies readonly ActivityKind[];
type CoversActivities = [ActivityKind] extends [(typeof ACTIVITY_KIND_ORDER)[number]] ? true : never;
const coversActivities: CoversActivities = true;
void coversActivities;

/** The game kinds in the New game menu's order (`GAME_KINDS`). A kind missing here stops the build. */
export const GAME_KIND_ORDER = ["tap_race", "survival", "draw"] as const satisfies readonly GameKind[];
type CoversGames = [GameKind] extends [(typeof GAME_KIND_ORDER)[number]] ? true : never;
const coversGames: CoversGames = true;
void coversGames;
