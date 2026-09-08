import Link from "next/link";
import type { Event } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { initials, formatDateRange } from "@/lib/text";

type NavItem = { href: string; label: string; icon: IconName };
const nav = (personal: boolean): NavItem[] => [
  { href: "", label: "Home", icon: "grid" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  personal ? { href: "/me", label: "Me", icon: "user" } : { href: "/info", label: "Info", icon: "info" },
];

function Mark({ event }: { event: Event }) {
  if (event.logo_url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={event.logo_url} alt="" className="h-10 w-10 rounded-[10px] object-contain" />
  );
  return <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand text-sm font-extrabold text-white">{initials(event.name)}</div>;
}

export function PortalShell({ event, basePath, personal, current = "", children }: { event: Event; basePath: string; personal: boolean; current?: "" | "/agenda" | "/me" | "/info"; children: React.ReactNode }) {
  const style = { ["--brand" as string]: event.primary_color } as React.CSSProperties;
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  if (event.status === "draft") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center p-6" style={style}>
        <div className="w-full rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center">
          <div className="mx-auto mb-4 w-fit"><Mark event={event} /></div>
          <h1 className="text-xl font-extrabold">{event.name}</h1>
          {meta && <p className="mt-1 text-sm text-muted">{meta}</p>}
          <p className="mt-4 text-sm text-muted">Coming soon. Check back closer to the event.</p>
        </div>
      </main>
    );
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas" style={style}>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <Link href={basePath || "/"} aria-label="Home"><Mark event={event} /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold leading-tight">{event.name}</div>
          {meta && <div className="truncate text-xs font-medium text-muted">{meta}</div>}
        </div>
      </header>
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-line bg-surface px-2 py-2">
        {nav(personal).map((n) => {
          const active = n.href === current;
          return (
            <Link key={n.href} href={`${basePath}${n.href}`} className={`flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-bold text-brand-ink" : "font-semibold text-muted"}`}>
              <Icon name={n.icon} size={22} /><span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
