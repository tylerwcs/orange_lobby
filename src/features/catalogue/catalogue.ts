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

/**
 * One line of the organiser's setup checklist (D444). A `step` is a section the organiser fills
 * in (its key is the section: basics, agenda, info); a `card` says what to send.
 */
export type SetupItem = {
  key: string;
  kind: "step" | "card";
  title: string;
  /** What to send, a line each; for a step, what it covers. */
  send: readonly string[];
  /** Only for events where attendees sign up themselves. */
  onlyWithRegistration?: boolean;
};

export type Feature = { name: string; summary: string; tier: "base" | "addon"; unlocks: Unlocks; setup?: readonly SetupItem[] };

const base = (name: string, summary: string, setup?: readonly SetupItem[]): Feature => ({ name, summary, tier: "base", unlocks: {}, setup });
const addon = (name: string, summary: string, unlocks: Unlocks = {}, setup?: readonly SetupItem[]): Feature => ({ name, summary, tier: "addon", unlocks, setup });

/** The one place a feature's name, summary and what it opens in admin live (D433). */
export const FEATURES: Record<FeatureKey, Feature> = {
  portal: base("Attendee portal and personal links", "Each attendee's own link to the portal.", [
    { key: "basics", kind: "step", title: "Event basics", send: ["Name, dates and venue", "Brand colour, logo and banner", "Committee numbers"] },
  ]),
  attendees: base("Attendee list", "Import and manage who is coming.", [
    { key: "attendee-list", kind: "card", title: "Attendee list", send: ["One Excel file (.xlsx), one person per row, headings in row 1", "Name (required), Mobile, Email and Category; Table No, team and breakout columns if you use them", "Malaysian mobile numbers. We flag any that can't receive WhatsApp"] },
  ]),
  agenda: base("Agenda", "Days and sessions.", [
    { key: "agenda", kind: "step", title: "Agenda", send: ["Each day's date and an optional name", "Sessions: start time and title; end time, location, description and a photo if you have them", "Breakout rounds and their room codes"] },
  ]),
  info: base("Event info and floor plan", "Info tabs and the venue plan.", [
    { key: "info", kind: "step", title: "Event info and floor plan", send: ["The info tabs you want, e.g. Getting there, Dress code, FAQ, with their text and images", "The floor plan, at least 2000 px wide"] },
  ]),
  announcements: base("Announcements", "News for attendees, pinned or not."),
  exports: base("Exports", "Spreadsheets, links and QR codes."),
  registration: base("Self-registration", "A sign-up form with your own questions.", [
    { key: "registration", kind: "card", title: "Registration questions", onlyWithRegistration: true, send: ["Opening and closing dates, and a short welcome paragraph", "Up to 10 questions beyond name, email, mobile and department"] },
  ]),
  check_in: base("Check-in", "Crew scanning, checkpoints and badges.", [
    { key: "check-in", kind: "card", title: "Check-in points", send: ["Each checkpoint you need, e.g. Day 1 registration or Gala dinner, and the day it applies to"] },
  ]),
  groups: base("Groups", "Teams built from a column."),
  breakouts: base("Breakout rooms", "Rounds and room assignment."),
  whatsapp: addon("WhatsApp messaging", "Send portal links and announcements by WhatsApp.", { nav: ["whatsapp"] }, [
    { key: "whatsapp", kind: "card", title: "WhatsApp messages", send: ["The wording of each message, written as a notice or confirmation, not an advert", "When each goes out, and to whom", "Meta approves every message first, so send these early"] },
  ]),
  booking: addon("Session booking", "Time slots attendees book, with capacity.", { activityKinds: ["booking"] }, [
    { key: "booking", kind: "card", title: "Session booking", send: ["Days, opening hours, slot length and breaks", "Places per slot, the location, and how many bookings each person may make"] },
  ]),
  engagement: addon("Engagement activities", "Stamp passport, submissions and scored challenges.", { activityKinds: ["submission", "passport"] }, [
    { key: "activities", kind: "card", title: "Activities", send: ["A name, a short description and a 1600 × 800 cover image for each", "Passport: booth names and locations, stamps needed and the reward message", "Submissions: the questions, open and close dates, entries per person and team rules"] },
  ]),
  live_games: addon("Live games", "Tap race and Last one standing on the LED.", { gameKinds: ["tap_race", "survival"] }, [
    { key: "live-games", kind: "card", title: "Live games", send: ["Tap race length, 10 to 60 seconds", "Quiz: up to 50 questions, 2 to 4 options each, with the right answer", "An LED background if you want your own, 1920 × 1080"] },
  ]),
  lucky_draw: addon("Lucky draw", "Slot machine, wheel, mosaic and card round.", { gameKinds: ["draw"] }, [
    { key: "lucky-draw", kind: "card", title: "Lucky draw", send: ["Prizes: name, quantity and a photo, about 1040 × 560 (transparent PNG is best)", "Who can win: a check-in point, and any categories to leave out", "The draw style: slot machine, wheel, mosaic or card round (card back 1000 × 1400)"] },
  ]),
  custom_domain: addon("Custom domain", "The event on its own address.", { settingsTabs: ["address"] }, [
    { key: "custom-domain", kind: "card", title: "Custom domain", send: ["The address you want, e.g. event.yourcompany.com", "Who manages your DNS, so we can send them the records to add"] },
  ]),
  slido: addon("Slido embedding", "Slido inside the portal. Until the embed is built, use a link tile.", {}, [
    { key: "slido", kind: "card", title: "Slido", send: ["Your Slido event link"] },
  ]),
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
