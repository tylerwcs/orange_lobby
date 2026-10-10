import type { ActivityKind } from "@/lib/types";
import type { GameKind } from "@/features/games/client";

/** Always on for every event, never stored (D433). */
export const BASE_KEYS = ["portal", "attendees", "agenda", "info", "announcements", "exports", "registration", "check_in", "groups", "breakouts"] as const;
export type BaseKey = (typeof BASE_KEYS)[number];

/** What an event can add (D433). A key added here must be added to FEATURES: the Record stops the build until it is. */
export const ADDON_KEYS = ["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido", "custom"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];
export type FeatureKey = BaseKey | AddonKey;

/** Stored in `event_features`. `custom` never is: an event has it when it has a custom module (D436). */
export type StoredAddon = Exclude<AddonKey, "custom">;
export const STORED_ADDONS = ADDON_KEYS.filter((k): k is StoredAddon => k !== "custom");

/** Sidebar items and settings tabs an add-on can hide. Activities and Games are hidden by their kinds, not named here. */
export type NavKey = "whatsapp" | "activities" | "games";
export type SettingsTabKey = "address";

export type Unlocks = {
  nav?: readonly NavKey[];
  activityKinds?: readonly ActivityKind[];
  gameKinds?: readonly GameKind[];
  settingsTabs?: readonly SettingsTabKey[];
};

export type Feature = { name: string; summary: string; tier: "base" | "addon"; unlocks: Unlocks };

const base = (name: string, summary: string): Feature => ({ name, summary, tier: "base", unlocks: {} });
const addon = (name: string, summary: string, unlocks: Unlocks = {}): Feature => ({ name, summary, tier: "addon", unlocks });

/** The one place a feature's name, summary and what it opens in admin live (D433). */
export const FEATURES: Record<FeatureKey, Feature> = {
  portal: base("Attendee portal and personal links", "Each attendee's own link to the portal."),
  attendees: base("Attendee list", "Import and manage who is coming."),
  agenda: base("Agenda", "Days and sessions."),
  info: base("Event info and floor plan", "Info tabs and the venue plan."),
  announcements: base("Announcements", "News for attendees, pinned or not."),
  exports: base("Exports", "Spreadsheets, links and QR codes."),
  registration: base("Self-registration", "A sign-up form with your own questions."),
  check_in: base("Check-in", "Crew scanning, checkpoints and badges."),
  groups: base("Groups", "Teams built from a column."),
  breakouts: base("Breakout rooms", "Rounds and room assignment."),
  whatsapp: addon("WhatsApp messaging", "Send portal links and announcements by WhatsApp.", { nav: ["whatsapp"] }),
  booking: addon("Session booking", "Time slots attendees book, with capacity.", { activityKinds: ["booking"] }),
  engagement: addon("Engagement activities", "Stamp passport, submissions and scored challenges.", { activityKinds: ["submission", "passport"] }),
  live_games: addon("Live games", "Tap race and Last one standing on the LED.", { gameKinds: ["tap_race", "survival"] }),
  lucky_draw: addon("Lucky draw", "Slot machine, wheel, mosaic and card round.", { gameKinds: ["draw"] }),
  custom_domain: addon("Custom domain", "The event on its own address.", { settingsTabs: ["address"] }),
  slido: addon("Slido embedding", "Slido inside the portal. Until the embed is built, use a link tile."),
  custom: addon("Custom module", "Bespoke work, described per event."),
};

/** The activity kinds in the New activity menu's order (`ACTIVITY_KINDS`). A kind missing here stops the build. */
export const ACTIVITY_KIND_ORDER = ["booking", "submission", "passport"] as const satisfies readonly ActivityKind[];
type CoversActivities = [ActivityKind] extends [(typeof ACTIVITY_KIND_ORDER)[number]] ? true : never;
const coversActivities: CoversActivities = true;
void coversActivities;

/** The game kinds in the New game menu's order (`GAME_KINDS`). A kind missing here stops the build. */
export const GAME_KIND_ORDER = ["tap_race", "survival", "draw"] as const satisfies readonly GameKind[];
type CoversGames = [GameKind] extends [(typeof GAME_KIND_ORDER)[number]] ? true : never;
const coversGames: CoversGames = true;
void coversGames;
