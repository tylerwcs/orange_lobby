import type { IconName } from "@/components/ui/Icon";

export type Item = { href: string; label: string; icon: IconName };
export type Group = { title: string; items: Item[] };

/**
 * Grouped by what you are doing, not by what kind of thing it is: "Portal" is the
 * honest name for the four pages that decide what an attendee sees, and Attendees
 * sits under Onsite because it is the roster you work during the event. Import and
 * Checkpoints are gone from here: import is a modal on the attendee list, and
 * checkpoints are configured in Settings.
 */
export function groupsFor(ev: { id: string } | null | undefined): Group[] {
  if (!ev) return [{ title: "Events", items: [{ href: "/admin/events", label: "All events", icon: "layers" }] }];
  const b = `/admin/events/${ev.id}`;
  return [
    { title: "Onsite", items: [
      { href: b, label: "Overview", icon: "home" },
      { href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" },
      { href: `${b}/attendees`, label: "Attendees", icon: "users" },
    ] },
    { title: "Portal", items: [
      { href: `${b}/agenda`, label: "Agenda", icon: "calendar" },
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
