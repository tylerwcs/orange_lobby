"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Event } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatDateRange } from "@/lib/text";
import { brandStyle } from "@/lib/brand";
import { activeNavHref, isPortalHome } from "@/lib/portal-nav";
import { Mark, PortalHeader } from "./PortalHeader";

type NavItem = { href: string; label: string; icon: IconName };

/**
 * Info is in the nav rather than being a tile: it is one of the few destinations every
 * attendee wants at some point, and a tile for it was a second route to a page the nav
 * could hold permanently. It only appears when the event actually has an info page -
 * a nav slot leading to an empty screen is worse than no slot.
 */
const nav = (personal: boolean, hasInfo: boolean): NavItem[] => [
  { href: "", label: "Home", icon: "grid" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  ...(hasInfo ? [{ href: "/info", label: "Info", icon: "info" as IconName }] : []),
  ...(personal ? [{ href: "/me", label: "Me", icon: "user" as IconName }] : []),
];

/**
 * The desktop home carries the agenda and the venue summary on the page itself, so a
 * header link to either would be a second route to what the reader is already looking at -
 * the same reason those stopped being tiles. The phone home cannot show them, so its bar
 * keeps them.
 *
 * `dashboard` is therefore about what is ON this page, not about screen width.
 */
const desktopNav = (items: NavItem[], dashboard: boolean): NavItem[] =>
  dashboard ? items.filter((n) => n.href === "" || n.href === "/me") : items;

const Banner = ({ url, className }: { url: string; className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={url} alt="" className={className} />
);

export function PortalChrome({ event, basePath, personal, children }: {
  event: Event;
  basePath: string;
  personal: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? basePath;
  const current = activeNavHref(pathname, basePath);
  // `hero` and `dashboard` were only ever true together, on the home route.
  const home = isPortalHome(pathname, basePath);

  const hasInfo = !!event.info_page_html;
  const style = brandStyle(event.primary_color) as React.CSSProperties;
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  const bannerClass = "mb-4 aspect-[3/1] w-full rounded-xl object-cover";
  const items = nav(personal, hasInfo);
  const headerItems = desktopNav(items, home);
  const shellWidth = home ? "max-w-md md:max-w-4xl xl:max-w-[1200px]" : "max-w-md md:max-w-4xl";

  if (event.status === "draft") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6" style={style}>
        {event.banner_url && <Banner url={event.banner_url} className={bannerClass} />}
        <div className="w-full rounded-xl border border-border bg-card p-6 text-center">
          <div className="mx-auto mb-4 w-fit"><Mark event={event} /></div>
          <h1 className="text-xl font-extrabold">{event.name}</h1>
          {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
          <p className="mt-4 text-sm text-muted-foreground">Coming soon. Check back closer to the event.</p>
        </div>
      </main>
    );
  }

  return (
    /*
      One layout, two shapes. Almost everyone opens this on a phone, so the phone case is
      the default and the desktop case is the override - not a separate design.
      Below md: a phone column with a thumb-reachable bottom bar.
      From md:  the column widens, and the same nav moves into the header, because a bar
                pinned to the bottom of a 1400px window is nowhere near anything.
    */
    <div className="flex min-h-screen flex-col bg-background" style={style}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">Skip to content</a>

      <div className="bg-card shadow-[0_1px_0_rgba(17,24,39,.08)]">
        <div className={`mx-auto w-full ${shellWidth} md:px-6`}>
          <div className="flex flex-col md:flex-row md:items-center md:gap-8">
            <PortalHeader event={event} href={basePath || "/"} className="md:flex-1 md:px-0" />

            {/* Desktop nav: the same items, in the header where a pointer already is. */}
            <nav aria-label="Sections" className="hidden shrink-0 gap-1 md:flex">
              {headerItems.map((n) => {
                const active = n.href === current;
                return (
                  <Link
                    key={n.href}
                    href={`${basePath}${n.href}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-accent font-bold text-primary" : "font-semibold text-muted-foreground hover:bg-muted"}`}
                  >
                    <Icon name={n.icon} size={18} />{n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      <main id="main" className={`mx-auto w-full flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-10 md:pt-6 ${shellWidth}`}>
        {home && event.banner_url && <Banner url={event.banner_url} className={bannerClass} />}
        {children}
      </main>

      {/* Mobile nav. Rendered separately rather than repositioned, because the two are
          genuinely different controls - icon-over-label thumb targets against a row of
          text links - and only one is ever in the tree's visible flow at a time. */}
      <nav
        aria-label="Sections"
        className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around bg-card px-2 py-2 shadow-[0_-1px_0_rgba(17,24,39,.08)] md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {items.map((n) => {
          const active = n.href === current;
          return (
            <Link key={n.href} href={`${basePath}${n.href}`} aria-current={active ? "page" : undefined} className={`flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-[8px] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "font-bold text-primary" : "font-semibold text-muted-foreground"}`}>
              <Icon name={n.icon} size={22} /><span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
