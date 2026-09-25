import type { ActivityKind } from "@/lib/types";

/**
 * Which tabs an activity page has (D234, D235), and the one URL shape every link and redirect
 * to them uses (D239). Setup is the default, so its URL carries no `tab` at all: a bare link
 * to an activity is a link to its setup, which is what the organiser comes back for.
 */
export type ActivityTab = "setup" | "bookings" | "not-booked" | "submissions" | "not-submitted" | "participation";

export type TabCounts = {
  booked?: number;
  notBooked?: number;
  pendingRequests?: number;
  submissions?: number;
  notSubmitted?: number;
  perDay?: boolean;
};

export type TabItem = { tab: ActivityTab; label: string; count: number | null; dot: boolean };

const item = (tab: ActivityTab, label: string, count: number | null = null, dot = false): TabItem => ({ tab, label, count, dot });

export function activityTabs(kind: ActivityKind, c: TabCounts): TabItem[] {
  const setup = item("setup", "Setup");
  if (kind === "booking") {
    // The dot, because pending requests left the landing view when Setup became it (D235).
    return [setup, item("bookings", "Bookings", c.booked ?? 0, (c.pendingRequests ?? 0) > 0), item("not-booked", "Not booked", c.notBooked ?? 0)];
  }
  if (kind === "submission") {
    const tabs = [setup, item("submissions", "Submissions", c.submissions ?? 0), item("not-submitted", "Not submitted", c.notSubmitted ?? 0)];
    return c.perDay ? [...tabs, item("participation", "Participation")] : tabs;
  }
  return [setup];
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
