import Link from "next/link";
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

export function PortalHeader({ event, href, className = "" }: { event: HeaderEvent; href?: string; className?: string }) {
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  return (
    <header className={`flex items-center gap-3 bg-card px-4 py-4 ${className}`}>
      {href ? <Link href={href} aria-label="Home"><Mark event={event} /></Link> : <Mark event={event} />}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-base font-extrabold leading-tight">{event.name}</div>
        {meta && <div className="truncate text-xs font-medium text-muted-foreground">{meta}</div>}
      </div>
    </header>
  );
}
