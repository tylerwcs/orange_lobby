import { HomeLink } from "./HomeLink";
import type { Event } from "@/lib/types";
import { initials, formatDateRange } from "@/lib/text";

type HeaderEvent = Pick<Event, "name" | "logo_url" | "starts_on" | "ends_on" | "venue_name">;

export function Mark({ event }: { event: HeaderEvent }) {
  if (event.logo_url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={event.logo_url} alt="" className="h-10 w-10 rounded-[10px] object-contain" />
  );
    // The organiser's colour with a foreground computed FOR it, rather than a fixed dark
  // ink that happened to fail on some of them. This mark is the element the 8 Sep audit
  // measured at 3.97:1, and it survived the 10 Sep redesign because nothing could see it.
  return <div className="flex size-10 items-center justify-center rounded-[10px] bg-brand text-sm font-extrabold text-brand-foreground">{initials(event.name)}</div>;
}

export function PortalHeader({ event, href, action, className = "" }: {
  event: HeaderEvent;
  href?: string;
  /**
   * Something at the right-hand end, e.g. the phone home's Me button (D236). With `href` it
   * sits under the home link's overlay, so it must lift itself above it (`relative z-10`).
   */
  action?: React.ReactNode;
  className?: string;
}) {
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  const identity = (
    <>
      <Mark event={event} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-base font-extrabold leading-tight">{event.name}</div>
        {meta && <div className="truncate text-xs font-medium text-muted-foreground">{meta}</div>}
      </div>
    </>
  );
  // The whole bar is the way home, not just the mark: the name is the bigger target, and it is
  // what people tap expecting to go back to the start. On the home page it refreshes instead.
  //
  // The link wraps only the mark and the name, and stretches over the rest of the bar with an
  // overlay (`after:absolute after:inset-0` against the header). Wrapping the whole bar put the
  // Me button's own <a> inside it, and a link inside a link is invalid HTML: the browser split
  // them apart, so the page hydrated against a tree the server never sent.
  return (
    <header className={`bg-card px-4 py-4 ${href ? "relative" : ""} ${className}`}>
      <div className="flex items-center gap-3">
        {href ? (
          <HomeLink href={href} label={`Home: ${event.name}`} className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-[12px] p-1 outline-none transition-opacity after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50">
            {identity}
          </HomeLink>
        ) : identity}
        {action}
      </div>
    </header>
  );
}
