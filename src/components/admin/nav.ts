import type { IconName } from "@/components/ui/Icon";

/** `external` marks a file download: it must render as a plain `<a download>`, never a prefetching `<Link>`. */
export type Item = { href: string; label: string; icon: IconName; external?: true };
export type Group = { title: string; items: Item[] };

export function groupsFor(ev: { id: string } | null | undefined): Group[] {
  if (!ev) return [{ title: "Events", items: [{ href: "/admin/events", label: "All events", icon: "layers" }] }];
  const b = `/admin/events/${ev.id}`;
  return [
    { title: "Setup", items: [{ href: b, label: "Overview", icon: "home" }, { href: `${b}/settings`, label: "Settings", icon: "settings" }, { href: `${b}/modules`, label: "Modules", icon: "grid" }] },
    { title: "Content", items: [{ href: `${b}/agenda`, label: "Agenda", icon: "calendar" }, { href: `${b}/announcements`, label: "Announcements", icon: "megaphone" }, { href: `${b}/info`, label: "Info page", icon: "info" }] },
    { title: "Attendees", items: [{ href: `${b}/attendees`, label: "Attendees", icon: "users" }, { href: `${b}/attendees/import`, label: "Import", icon: "download" }] },
    { title: "Onsite", items: [{ href: `${b}/checkpoints`, label: "Checkpoints", icon: "flag" }, { href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" }] },
    { title: "Reports", items: [{ href: `${b}/export/attendance.xlsx`, label: "Attendance", icon: "file", external: true }, { href: `${b}/export/links.xlsx`, label: "Links", icon: "link", external: true }, { href: `${b}/export/qr.zip`, label: "QR codes", icon: "qr", external: true }] },
  ];
}
