import type { ActivityKind } from "@/lib/types";

/**
 * Which tabs an activity page has (D234, D235), and the one URL shape every link and redirect
 * to them uses (D239). Setup is the default, so its URL carries no `tab` at all: a bare link
 * to an activity is a link to its setup, which is what the organiser comes back for.
 */
export type ActivityTab = "setup" | "bookings" | "not-booked" | "submissions" | "not-submitted" | "participation" | "leaderboard" | "polaroids" | "stickers" | "squads" | "sports" | "matches";

export type TabCounts = {
  booked?: number;
  notBooked?: number;
  pendingRequests?: number;
  submissions?: number;
  notSubmitted?: number;
  perDay?: boolean;
  /** D360: a group form is chased by group, not by person, so its tab says Not done, not Not
   * submitted, and has no Participation strip (that reads per-attendee drift, which a group
   * form does not track). */
  grouped?: boolean;
  /** D381: a scored challenge has a Leaderboard tab. D664: so does a tournament with points per place. */
  scored?: boolean;
  /** D485: a polaroid wall's live count, for its Polaroids tab. */
  polaroids?: number;
  /** D648: squads below their sport's minimum, for the dot on a tournament's Squads tab. */
  shortSquads?: number;
};

export type TabItem = { tab: ActivityTab; label: string; count: number | null; dot: boolean };

const item = (tab: ActivityTab, label: string, count: number | null = null, dot = false): TabItem => ({ tab, label, count, dot });
const setup = () => item("setup", "Setup");

/** One entry per kind (D414): a kind added to ActivityKind does not build until it has its tabs. */
const TABS: Record<ActivityKind, (c: TabCounts) => TabItem[]> = {
  // The dot, because pending requests left the landing view when Setup became it (D235).
  booking: (c) => [setup(), item("bookings", "Bookings", c.booked ?? 0, (c.pendingRequests ?? 0) > 0), item("not-booked", "Not booked", c.notBooked ?? 0)],
  submission: (c) => {
    const tabs = [setup(), item("submissions", "Submissions", c.submissions ?? 0), item("not-submitted", c.grouped ? "Not done" : "Not submitted", c.notSubmitted ?? 0)];
    if (c.grouped) return tabs;
    const withDaily = c.perDay ? [...tabs, item("participation", "Participation")] : tabs;
    return c.scored ? [...withDaily, item("leaderboard", "Leaderboard")] : withDaily;
  },
  // A passport's booths and links are all on Setup (D190).
  passport: () => [setup()],
  // D485: the moderation feed and the sticker pack; Setup holds details, links and the wall.
  polaroid: (c) => [setup(), item("polaroids", "Polaroids", c.polaroids ?? 0), item("stickers", "Stickers")],
  // D648: the squads to chase, then the sports that make them; the dot while any squad is short.
  // D664: then results, and the overall leaderboard once there is a points table.
  tournament: (c) => [
    setup(), item("squads", "Squads", null, (c.shortSquads ?? 0) > 0), item("sports", "Sports"), item("matches", "Matches"),
    ...(c.scored ? [item("leaderboard", "Leaderboard")] : []),
  ],
};

export function activityTabs(kind: ActivityKind, c: TabCounts): TabItem[] {
  return TABS[kind](c);
}

/** A requested tab this page does not have (a stale link, a hand-edited URL) opens Setup. */
export function resolveTab(tabs: TabItem[], requested: string | undefined): ActivityTab {
  return tabs.find((t) => t.tab === requested)?.tab ?? "setup";
}

export function activityHref(eventId: string, activityId: string, tab: ActivityTab = "setup", extra: Record<string, string> = {}): string {
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  const qs = new URLSearchParams();
  if (tab !== "setup") qs.set("tab", tab);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
