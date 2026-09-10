"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { signOut } from "@/app/login/actions";
import { groupsFor } from "./nav";

export function Sidebar({ email, event }: { email: string; event?: { id: string; name: string; status: string } | null }) {
  const pathname = usePathname();
  const groups = groupsFor(event);
  // The overview item is a prefix of every other item in its section, so it only
  // lights up on an exact match; the rest also match their own sub-routes.
  const root = event ? `/admin/events/${event.id}` : "/admin/events";
  const isActive = (i: { href: string; external?: true }) =>
    !i.external && (pathname === i.href || (i.href !== root && pathname.startsWith(`${i.href}/`)));
  const itemClass = (active: boolean) =>
    `flex min-h-11 items-center gap-2.5 rounded-[9px] px-2 text-sm ${active ? "bg-brand-soft font-extrabold text-brand-ink" : "font-bold text-ink hover:bg-canvas"}`;
  return (
    <aside className="m-3 flex w-full flex-col gap-3.5 rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] md:min-h-[calc(100vh-1.5rem)] md:w-64">
      <Link href="/admin" className="flex items-center gap-2.5 px-1 font-extrabold">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand text-xs text-ink">OL</span> Orange Lobby
      </Link>
      {event && (
        <Link href="/admin/events" className="flex items-center gap-2 rounded-[12px] bg-canvas p-2.5 hover:brightness-95">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold">{event.name}</span>
            <span className="mt-1 block"><Badge tone={event.status === "live" ? "brand" : event.status === "archived" ? "ink" : "neutral"} dot={event.status === "live"}>{event.status}</Badge></span>
          </span>
          <Icon name="chevron" size={16} className="shrink-0 rotate-90 text-muted" />
        </Link>
      )}
      <nav className="flex flex-1 gap-4 overflow-x-auto md:flex-col">
        {groups.map((g) => (
          <div key={g.title} className="flex shrink-0 flex-col gap-0.5">
            <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{g.title}</div>
            {g.items.map((i) => i.external
              // A download route: `<Link>` would prefetch it and pull the file down on hover.
              ? <a key={i.href} href={i.href} download className={itemClass(false)}><Icon name={i.icon} size={18} />{i.label}</a>
              : <Link key={i.href} href={i.href} className={itemClass(isActive(i))}><Icon name={i.icon} size={18} />{i.label}</Link>
            )}
          </div>
        ))}
      </nav>
      <form action={signOut} className="flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
        <span className="truncate">{email}</span>
        <button className="flex min-h-11 items-center gap-1 font-bold"><Icon name="logout" size={14} /> Sign out</button>
      </form>
    </aside>
  );
}
