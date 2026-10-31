import type { Origin } from "./catalogue";
import type { EventUsage } from "./usage";

/**
 * A polaroid wall has a print look (D718) once any of `polaroid.card`'s background, logo or ink is set (readPolaroidSettings
 * fills a missing part with null). Read by hand rather than through readPolaroidSettings: the sidebar, a client component,
 * imports this file, and the polaroid client entry would bring the wall's screens with it.
 */
const polaroidLookSet = (raw: unknown): boolean => {
  const card = raw && typeof raw === "object" ? (raw as { card?: unknown }).card : null;
  if (!card || typeof card !== "object") return false;
  const { background, logo, ink } = card as Record<string, unknown>;
  return [background, logo, ink].some((v) => typeof v === "string" && v !== "");
};

/**
 * A capability inside a feature, set in that feature's own settings, with no switch (D777).
 * `where` says where it is set; `inUse` is given only where one event column or activity field answers it.
 */
export type Option = {
  key: string;
  name: string;
  summary: string;
  origin?: Origin;
  where: string;
  /** Built for one client and not yet proven on a second event. */
  experimental?: true;
  inUse?: (u: EventUsage) => boolean;
};

const REGISTRATION = "Settings → Registration";
const CHECK_IN = "Settings → Check-in";
const EVENT = "Settings → Event";
const PORTAL_LOOK = "Settings → Portal look";
const ACTIVITY = "Each activity's settings";
const GROUPS = "Groups page";

/** Self-registration's options (D677, D696, D583, D540, D634, D766, D618, D600, D732). */
export const REGISTRATION_OPTIONS: readonly Option[] = [
  { key: "waiting_list", name: "Waiting list", summary: "Cap registrations; extra people join a waiting list.", origin: { date: "2026-10", decision: "D677" }, where: REGISTRATION, inUse: ({ ev }) => ev.registration_limit != null },
  { key: "approval", name: "Approval", summary: "Registrations wait for an organiser to approve them.", origin: { date: "2026-10", decision: "D696" }, where: REGISTRATION, inUse: ({ ev }) => !!ev.registration_needs_approval },
  { key: "self_cancel", name: "Self-cancel", summary: "Attendees cancel their own place and give a reason.", origin: { date: "2026-10", decision: "D583" }, where: REGISTRATION, inUse: ({ ev }) => ev.self_cancel },
  { key: "event_terms", name: "Event terms", summary: "Client clauses to tick on the form and the portal.", origin: { date: "2026-10", decision: "D540" }, where: REGISTRATION, inUse: ({ ev }) => !!ev.registration_terms },
  { key: "done_page", name: "You're in page", summary: "A confirmation page with a QR after registering.", origin: { date: "2026-10", decision: "D634" }, where: REGISTRATION, inUse: ({ ev }) => !!ev.registration_done_page },
  { key: "after_register_booking", name: "Open booking after registering", summary: "Send new registrants straight to a booking activity.", origin: { date: "2026-10", decision: "D766", event: "MYBESTME" }, where: REGISTRATION, experimental: true, inUse: ({ ev }) => !!ev.after_register_activity_id },
  { key: "registration_images", name: "Banner and form image", summary: "A banner on top and an image under the form.", origin: { date: "2026-10", decision: "D618" }, where: REGISTRATION },
  { key: "scheduled_open", name: "Scheduled opening", summary: "Pick a time and an activity opens by itself.", origin: { date: "2026-10", decision: "D600" }, where: ACTIVITY },
  { key: "tick_box_questions", name: "Tick-box questions", summary: "Questions where people tick all that apply.", origin: { date: "2026-10", decision: "D732" }, where: REGISTRATION },
];

/** Check-in's options (D388, D759). */
export const CHECK_IN_OPTIONS: readonly Option[] = [
  { key: "badge_checkin", name: "Badge check-in pill", summary: "A check-in pill on the badge.", origin: { date: "2026-09", decision: "D388" }, where: CHECK_IN, inUse: ({ ev }) => ev.check_in_enabled && ev.badge_checkin },
  { key: "scan_card", name: "Scan card fields", summary: "Choose which attendee details crew see after a scan.", where: CHECK_IN },
  { key: "door_survey", name: "Door survey", summary: "Crew ask a short form after each check-in.", origin: { event: "MYBESTME", date: "2026-10", decision: "D759" }, where: CHECK_IN, experimental: true },
];

/** The attendee portal's options (D622, D636, D633, D617, D536, D714, D550). */
export const PORTAL_OPTIONS: readonly Option[] = [
  { key: "theme", name: "Theme and glow", summary: "Colours that make the portal match the event's look.", origin: { event: "UOB", date: "2026-10", decision: "D622" }, where: PORTAL_LOOK },
  { key: "name_line_breaks", name: "Name line breaks", summary: "Choose where the event name wraps.", origin: { date: "2026-10", decision: "D633" }, where: EVENT },
  { key: "coming_soon", name: "Coming soon message", summary: "Your own wording on the page before the event opens.", origin: { date: "2026-10", decision: "D617" }, where: EVENT, inUse: ({ ev }) => !!ev.coming_soon_message },
  { key: "me_page", name: "Me page", summary: "What attendees see about themselves on their Me page.", origin: { date: "2026-10", decision: "D536" }, where: PORTAL_LOOK },
  { key: "badge_pins", name: "Badge pins", summary: "Up to a few facts shown under each attendee's name on their badge.", where: PORTAL_LOOK },
  { key: "preview_link", name: "Preview link", summary: "Show the portal to someone without a login.", origin: { date: "2026-10", decision: "D714" }, where: EVENT, inUse: ({ ev }) => !!ev.preview_token },
  { key: "committee_logins", name: "Committee logins", summary: "Give event committee members their own login.", origin: { date: "2026-10", decision: "D550" }, where: "Settings → Committee" },
];

/** Groups' options (D367, D507, D348). */
export const GROUPS_OPTIONS: readonly Option[] = [
  { key: "group_tile", name: "Groups tile", summary: "Show or hide the group tile on the portal.", origin: { date: "2026-09", decision: "D367" }, where: GROUPS },
  { key: "all_groups", name: "All groups tab", summary: "Members can look at every group.", origin: { date: "2026-10", decision: "D507" }, where: GROUPS, inUse: ({ ev }) => ev.all_groups },
  { key: "group_fields", name: "Fields members see", summary: "Pick the details group members see about each other.", origin: { date: "2026-09", decision: "D348" }, where: GROUPS },
];

/** Engagement's options (D492, D735, D524, D776, D704, D637, D718). */
export const ENGAGEMENT_OPTIONS: readonly Option[] = [
  { key: "verifiers", name: "Verifiers", summary: "Verifier links to approve submissions, with revoke reasons.", origin: { date: "2026-10", decision: "D492" }, where: ACTIVITY },
  { key: "undo_revoke", name: "Undo revoke", summary: "Bring a revoked submission back as approved.", origin: { date: "2026-10", decision: "D735" }, where: ACTIVITY },
  { key: "partner_submissions", name: "Submit with partner", summary: "Tag someone from another team on an entry.", origin: { date: "2026-10", decision: "D524" }, where: ACTIVITY, inUse: ({ activities }) => activities.some((a) => a.allow_pair) },
  { key: "tracks", name: "Tracks", summary: "Run two scored tracks; captains can submit for the team.", origin: { date: "2026-10", decision: "D776" }, where: ACTIVITY, experimental: true },
  { key: "ad_hoc_points", name: "Ad hoc points", summary: "Bonus and penalty points on a leaderboard.", origin: { date: "2026-10", decision: "D704" }, where: ACTIVITY },
  { key: "tournaments", name: "Tournaments", summary: "Squads, captains and results across rounds.", origin: { date: "2026-10", decision: "D637" }, where: ACTIVITY },
  { key: "polaroid_print_look", name: "Polaroid print look", summary: "Card background, logo and ink for printed polaroids.", origin: { date: "2026-10", decision: "D718", event: "UOB" }, where: ACTIVITY, experimental: true, inUse: ({ activities }) => activities.some((a) => a.kind === "polaroid" && polaroidLookSet(a.polaroid)) },
];

/** Session booking's option. */
export const BOOKING_OPTIONS: readonly Option[] = [
  { key: "committee_alerts", name: "Committee alerts", summary: "Tell the committee when someone asks to change a booking.", where: "Settings → Committee", inUse: ({ ev }) => ev.committee_alert_numbers.length > 0 },
];

/** The attendee list's option (D742). */
export const ATTENDEES_OPTIONS: readonly Option[] = [
  { key: "change_log", name: "Change log", summary: "See who changed an attendee, and when.", origin: { date: "2026-10", decision: "D742" }, where: "Attendee page" },
];
