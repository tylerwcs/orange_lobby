"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { Event } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatDateRange } from "@/lib/text";
import { brandStyle } from "@/lib/brand";
import { activeNavHref, isPortalHome } from "@/lib/portal-nav";
import type { ActivityNav } from "@/lib/portal-activities";
import { Mark, PortalHeader } from "./PortalHeader";

type NavItem = { href: string; label: string; icon: IconName; dot?: boolean };

/**
 * The desktop header's links. On a phone there is no bar any more: the home page's launcher
 * is the navigation, and every other page leads back to it (D209). The same rules pick the
 * launcher's sections - see `launcherItems`.
 *
 * Agenda and Info are separate links (D216). They shared one slot while a phone bar had to
 * fit them; the header has room, and the launcher gives each its own button.
 *
 * Activities is a slot only for somebody who can see at least one, the same rule Info always
 * followed: a slot leading to an empty screen is worse than no slot. Its dot is the "Pick
 * one" nag the home card used to carry, moved to where the choosing happens.
 */
const nav = (personal: boolean, hasInfo: boolean, activities: ActivityNav | undefined): NavItem[] => [
  { href: "", label: "Home", icon: "grid" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  ...(hasInfo ? [{ href: "/info", label: "Info", icon: "info" as IconName }] : []),
  ...(personal && activities?.show
    ? [{ href: "/activities", label: "Activities", icon: "ticket" as IconName, dot: activities.owed }]
    : []),
  ...(personal ? [{ href: "/me", label: "Me", icon: "user" as IconName }] : []),
];

/**
 * The desktop home carries the agenda and the venue summary on the page itself, so a
 * header link to either would be a second route to what the reader is already looking at -
 * the same reason those stopped being tiles. Activities is not on that page, so it stays.
 * The phone home cannot show any of them, so its bar keeps them all.
 *
 * `dashboard` is therefore about what is ON this page, not about screen width.
 */
const desktopNav = (items: NavItem[], dashboard: boolean): NavItem[] =>
  dashboard ? items.filter((n) => n.href !== "/agenda") : items;

/** The dot, and the words a screen reader hears in its place. */
const Owed = ({ className }: { className: string }) => (
  <>
    <span aria-hidden className={`size-2 rounded-full bg-primary ${className}`} />
    <span className="sr-only">, a choice is waiting</span>
  </>
);

const Banner = ({ url, className }: { url: string; className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={url} alt="" className={className} />
);

/**
 * Only what the chrome actually reads. `Event` also carries `crew_token`, `org_id` and
 * `active_checkpoint_id` — a client component's props are serialised into the page, so passing
 * the full row would publish the crew scanner's login-free authority to every visitor.
 */
export type ChromeEvent = Pick<
  Event,
  "name" | "logo_url" | "starts_on" | "ends_on" | "venue_name" | "status" | "primary_color" | "banner_url"
>;

export function PortalChrome({ event, basePath, personal, activities, hasInfo, children }: {
  event: ChromeEvent;
  basePath: string;
  personal: boolean;
  /** Whether this attendee gets an Activities slot, and whether it carries a dot. */
  activities?: ActivityNav;
  /** Whether the event has an Info section (D205). A boolean, not the HTML: this component's
   *  props are published into the page (D121). */
  hasInfo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = activeNavHref(pathname, basePath);
  // `hero` and `dashboard` were only ever true together, on the home route.
  const home = isPortalHome(pathname, basePath);

  const style = brandStyle(event.primary_color) as React.CSSProperties;
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  const bannerClass = "mb-4 aspect-[3/1] w-full rounded-xl object-cover";
  const headerItems = desktopNav(nav(personal, hasInfo, activities), home);
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
      Below md: a phone column. No bar: home is the launcher, other pages lead back to it (D209).
      From md:  the column widens and the sections are text links in the header (D210).
    */
    <div className="flex min-h-screen flex-col bg-background" style={style}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">Skip to content</a>

      <div className="bg-card shadow-[0_1px_0_rgba(17,24,39,.08)]">
        <div className={`mx-auto w-full ${shellWidth} md:px-6`}>
          <div className="flex flex-col md:flex-row md:items-center md:gap-8">
            {/* Phone, away from home: the way back, where the bottom bar used to be the way
                anywhere (D209). The event's name is on the home page it leads to. */}
            {!home && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 md:hidden">
                <Link
                  href={basePath || "/"}
                  className="-ml-2 flex min-h-11 items-center gap-0.5 rounded-md px-2 text-[15px] font-bold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft aria-hidden className="size-5" />Home
                </Link>
                <Mark event={event} />
              </div>
            )}
            <div className={`${home ? "" : "hidden md:block"} md:flex-1`}>
              <PortalHeader event={event} href={basePath || "/"} className="md:px-0" />
            </div>

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
                    {n.dot && <Owed className="-ml-0.5" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      <main id="main" className={`mx-auto w-full flex-1 px-4 pb-10 pt-4 md:px-6 md:pt-6 ${shellWidth}`}>
        {home && event.banner_url && <Banner url={event.banner_url} className={bannerClass} />}
        {children}
      </main>

    </div>
  );
}
