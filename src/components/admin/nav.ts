import type { IconName } from "@/components/ui/icon";

export type Item = { href: string; label: string; icon: IconName };
export type Group = { title: string; items: Item[] };

/**
 * Grouped by what you are doing, not by what kind of thing it is: "Portal" is the
 * honest name for the four pages that decide what an attendee sees, and Attendees
 * sits under Onsite because it is the roster you work during the event. Import and
 * Checkpoints are gone from here: import is a modal on the attendee list, and
 * checkpoints are configured in Settings.
 *
 * The Scanner comes and goes with `check_in_enabled` (D159). Everything else in Onsite
 * stands on its own without check-in: booths keep stamping and the roster is still the
 * roster, which is why only this one item is conditional.
 */
export function groupsFor(ev: { id: string; check_in_enabled: boolean } | null | undefined): Group[] {
  if (!ev) return [{ title: "Events", items: [{ href: "/admin/events", label: "All events", icon: "layers" }] }];
  const b = `/admin/events/${ev.id}`;
  return [
    { title: "Onsite", items: [
      { href: b, label: "Overview", icon: "home" },
      ...(ev.check_in_enabled ? [{ href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" as IconName }] : []),
      { href: `${b}/booths`, label: "Booths", icon: "star" },
      { href: `${b}/attendees`, label: "Attendees", icon: "users" },
    ] },
    { title: "Portal", items: [
      { href: `${b}/agenda`, label: "Agenda", icon: "calendar" },
      { href: `${b}/activities`, label: "Activities", icon: "flag" },
      { href: `${b}/announcements`, label: "Announcements", icon: "megaphone" },
      { href: `${b}/info`, label: "Info page", icon: "info" },
      { href: `${b}/modules`, label: "Modules", icon: "grid" },
    ] },
    { title: "Event", items: [
      { href: `${b}/settings`, label: "Settings", icon: "settings" },
      { href: `${b}/exports`, label: "Exports", icon: "file" },
    ] },
  ];
}
