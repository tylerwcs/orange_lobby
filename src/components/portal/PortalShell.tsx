import Link from "next/link";
import type { Event } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDateRange } from "@/lib/text";
import { brandStyle } from "@/lib/brand";
import { Mark, PortalHeader } from "./PortalHeader";

type NavItem = { href: string; label: string; icon: IconName };
const nav = (personal: boolean): NavItem[] => [
  { href: "", label: "Home", icon: "grid" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  personal ? { href: "/me", label: "Me", icon: "user" } : { href: "/info", label: "Info", icon: "info" },
];

const Banner = ({ url, className }: { url: string; className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={url} alt="" className={className} />
);

export function PortalShell({ event, basePath, personal, current = null, hero = false, children }: { event: Event; basePath: string; personal: boolean; current?: "" | "/agenda" | "/me" | "/info" | null; hero?: boolean; children: React.ReactNode }) {
  const style = brandStyle(event.primary_color) as React.CSSProperties;
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  const bannerClass = "mb-4 w-full rounded-[var(--radius-card)]";
  if (event.status === "draft") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6" style={style}>
        {event.banner_url && <Banner url={event.banner_url} className={bannerClass} />}
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
      <PortalHeader event={event} href={basePath || "/"} />
      <main className="flex-1 px-4 pb-24 pt-4">
        {hero && event.banner_url && <Banner url={event.banner_url} className={bannerClass} />}
        {children}
      </main>
      <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-line bg-surface px-2 py-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {nav(personal).map((n) => {
          const active = n.href === current;
          return (
            <Link key={n.href} href={`${basePath}${n.href}`} aria-current={active ? "page" : undefined} className={`flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-[8px] text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active ? "font-bold text-brand-ink" : "font-semibold text-muted"}`}>
              <Icon name={n.icon} size={22} /><span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
