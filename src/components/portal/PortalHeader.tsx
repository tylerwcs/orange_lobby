import Link from "next/link";
import type { Event } from "@/lib/types";
import { initials, formatDateRange } from "@/lib/text";

type HeaderEvent = Pick<Event, "name" | "logo_url" | "starts_on" | "ends_on" | "venue_name">;

export function Mark({ event }: { event: HeaderEvent }) {
  if (event.logo_url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={event.logo_url} alt="" className="h-10 w-10 rounded-[10px] object-contain" />
  );
  return <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand text-sm font-extrabold text-white">{initials(event.name)}</div>;
}

export function PortalHeader({ event, href }: { event: HeaderEvent; href?: string }) {
  const meta = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
      {href ? <Link href={href} aria-label="Home"><Mark event={event} /></Link> : <Mark event={event} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-extrabold leading-tight">{event.name}</div>
        {meta && <div className="truncate text-xs font-medium text-muted">{meta}</div>}
      </div>
    </header>
  );
}
