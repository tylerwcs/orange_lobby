import type { IconName } from "@/components/ui/icon";
import type { NavKey } from "@/features/catalogue/client";

/** `newTab`: the Scanner is a tool of its own, worked on a phone or at a desk alongside the admin. */
export type Item = { href: string; label: string; icon: IconName; newTab?: boolean; key?: NavKey };
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
 * Add-ons the event doesn't have are left out (D438): WhatsApp, Activities and Games each
 * carry the key `hiddenNav` names.
 */
export function groupsFor(ev: { id: string; check_in_enabled: boolean } | null | undefined, hidden: readonly NavKey[] = []): Group[] {
  if (!ev) return [{ title: "Events", items: [{ href: "/admin/events", label: "All events", icon: "layers" }] }];
  const b = `/admin/events/${ev.id}`;
  const groups: Group[] = [
    { title: "Onsite", items: [
      { href: b, label: "Overview", icon: "home" },
      { href: `${b}/attendees`, label: "Attendees", icon: "users" },
      { href: `${b}/groups`, label: "Groups", icon: "layers" },
      { href: `${b}/games`, label: "Games", icon: "star", key: "games" },
      ...(ev.check_in_enabled ? [{ href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" as IconName, newTab: true }] : []),
    ] },
    { title: "Portal", items: [
      { href: `${b}/agenda`, label: "Agenda", icon: "calendar" },
      { href: `${b}/info`, label: "Info page", icon: "info" },
      { href: `${b}/announcements`, label: "Announcements", icon: "megaphone" },
      { href: `${b}/modules`, label: "Modules", icon: "grid" },
      { href: `${b}/activities`, label: "Activities", icon: "flag", key: "activities" },
    ] },
    { title: "Event", items: [
      { href: `${b}/whatsapp`, label: "WhatsApp", icon: "chat", key: "whatsapp" },
      { href: `${b}/settings`, label: "Settings", icon: "settings" },
      { href: `${b}/exports`, label: "Exports", icon: "file" },
    ] },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.key || !hidden.includes(i.key)) }));
}
