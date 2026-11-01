import type { IconName } from "@/components/ui/icon";
import type { NavKey } from "@/features/catalogue/client";

/** `newTab`: the Scanner is a tool of its own, worked on a phone or at a desk alongside the admin. */
export type Item = { href: string; label: string; icon: IconName; newTab?: boolean; key?: NavKey; badge?: number; adminOnly?: true };
export type Group = { title: string; items: Item[] };

/**
 * Grouped by what you are doing, not by what kind of thing it is: "Portal" is the
 * honest name for the pages that decide what an attendee sees, in the order an attendee
 * meets them, and Attendees sits under Onsite because it is the roster you work during
 * the event. WhatsApp is under Event: it messages people outside the portal. Import and
 * Checkpoints are gone from here: import is a modal on the attendee list, and
 * checkpoints are configured in Settings.
 *
 * The Scanner comes and goes with `check_in_enabled` (D159). Everything else in Onsite
 * stands on its own without check-in: the roster is still the roster, which is why only
 * this one item is conditional.
 *
 * Add-ons the event doesn't have are left out (D438): WhatsApp, Activities and Games (live games, the lucky draw or
 * Slime Splat, D797) each carry the key `hiddenNav` names.
 *
 * D598: Attendees carries the number of cancellation requests waiting for an organiser, for
 * admins and committee alike.
 *
 * D565: an item marked `adminOnly` is Ecopia's, so a committee member (`admin` false) does not get
 * it. Features, the all-events registry page (D780), is the one marked on the events list; inside an event
 * nothing is (Setup was the only one, removed in D783).
 */
export function groupsFor(ev: { id: string; check_in_enabled: boolean } | null | undefined, hidden: readonly NavKey[] = [], badges: { attendees?: number } = {}, admin = true): Group[] {
  if (!ev) {
    const items: Item[] = [
      { href: "/admin/events", label: "All events", icon: "layers" },
      { href: "/admin/features", label: "Features", icon: "grid", adminOnly: true },
    ];
    return [{ title: "Events", items: items.filter((i) => admin || !i.adminOnly) }];
  }
  const b = `/admin/events/${ev.id}`;
  const groups: Group[] = [
    { title: "Onsite", items: [
      { href: b, label: "Overview", icon: "home" },
      { href: `${b}/attendees`, label: "Attendees", icon: "users", ...(badges.attendees ? { badge: badges.attendees } : {}) },
      { href: `${b}/groups`, label: "Groups", icon: "layers" },
      { href: `${b}/games`, label: "Games", icon: "star", key: "games" },
      ...(ev.check_in_enabled ? [{ href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" as IconName, newTab: true }] : []),
    ] },
    { title: "Portal", items: [
      { href: `${b}/agenda`, label: "Agenda", icon: "calendar" },
      { href: `${b}/info`, label: "Info page", icon: "info" },
      { href: `${b}/announcements`, label: "Announcements", icon: "megaphone" },
      { href: `${b}/popups`, label: "Popups", icon: "bell", key: "popups" },
      { href: `${b}/modules`, label: "Modules", icon: "grid" },
      { href: `${b}/activities`, label: "Activities", icon: "flag", key: "activities" },
    ] },
    { title: "Event", items: [
      { href: `${b}/whatsapp`, label: "WhatsApp", icon: "chat", key: "whatsapp" },
      { href: `${b}/settings`, label: "Settings", icon: "settings" },
      { href: `${b}/exports`, label: "Exports", icon: "file" },
    ] },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => (!i.key || !hidden.includes(i.key)) && (admin || !i.adminOnly)) }));
}
