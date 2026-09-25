import type { AgendaItem } from "@/lib/types";
import { isNow, type DayTab } from "@/lib/agenda";
import { agendaAccentClass } from "@/lib/agenda-colours";
import { isBreakout } from "@/lib/breakouts";
import { bookedSessionId, isBookedRow } from "@/lib/activities";
import { CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgendaImage } from "./AgendaImage";
import { shortDate } from "@/lib/text";
import { Skeleton } from "@/components/ui/skeletons";
import { PendingScope, PendingSwap } from "@/components/PendingNav";
import { PortalTabStrip } from "./PortalTabStrip";

/** What a day looks like while the next one loads: the shape of a few sessions. */
const DaySkeleton = () => (
  <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading the day">
    {["h-[76px]", "h-[116px]", "h-[76px]"].map((h, i) => <Skeleton key={i} className={`${h} rounded-[14px]`} />)}
  </div>
);

export function AgendaList({ items, day, days, basePath, now, dayHref, calendarHref }: {
  items: AgendaItem[];
  day: string | null;
  days: DayTab[];
  basePath: string;
  now: { date: string; time: string };
  /** Where a day tab goes. Defaults to the agenda page; the desktop home points at itself. */
  dayHref?: (day: string) => string;
  /**
   * The calendar file for a booked session, given its id. Only the personal portal has
   * bookings, so only it passes this; a booked row without one simply shows no link.
   */
  calendarHref?: (sessionId: string) => string | null;
}) {
  const hrefForDay = dayHref ?? ((d: string) => `${basePath}/agenda?day=${d}`);
  if (!day) return <p className="text-sm text-muted-foreground">Agenda will be published soon.</p>;
  const todays = items.filter((i) => i.day === day);
  return (
    // The day tabs change only `?day=`, which no loading.tsx sees; the scope moves the
    // underline at once and swaps the sessions for a skeleton until the day arrives.
    <PendingScope>
    <div className="flex flex-col gap-3">
      <PortalTabStrip
        tabs={days.map((d) => ({ key: d.date, href: hrefForDay(d.date), label: d.name ?? shortDate(d.date), sub: d.name ? shortDate(d.date) : null }))}
        selected={day}
      />
      <PendingSwap fallback={<DaySkeleton />}>
      {todays.map((i) => {
        if (i.kind === "image") return <ImageRow key={i.id} item={i} />;
        const live = isNow(i, now.date, now.time);
        const accent = agendaAccentClass(i.color);
        return (
          <div key={i.id} id={live ? "now" : undefined} className={`relative flex gap-3 overflow-hidden rounded-[14px] p-3.5 scroll-mt-4 bg-card ${live ? "border-2 border-primary" : "border border-border"}`}>
            {/* A saturated bar down the leading edge, not a tint behind the text: every
                chart ink is already proven 3:1 against a white card, and a pastel fill was
                tried and taken back out at about 1.2:1. Hidden from screen readers — the
                colour carries no meaning of its own, so announcing it would be noise. */}
            {accent && <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${accent}`} />}
            <div className="w-11 shrink-0">
              <div className={`text-[13px] font-extrabold ${live ? "text-primary" : "text-muted-foreground"}`}>{i.starts_at}</div>
              {live ? <div className="text-[11px] font-extrabold tracking-[0.08em] text-primary">NOW</div> : i.ends_at && <div className="text-[11px] text-muted-foreground">{i.ends_at}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">{i.title}</div>
              {i.location && (
                <div className={isBreakout(i) || isBookedRow(i) ? "text-sm font-extrabold text-primary" : "text-xs text-muted-foreground"}>
                  {i.location}
                </div>
              )}
              {i.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{i.description}</p>}
              {i.categories && i.categories.length > 0 && <div className="mt-1.5"><Badge variant="secondary">{i.categories.join(", ")}</Badge></div>}
              {isBookedRow(i) && (() => {
                const sessionId = bookedSessionId(i);
                const ics = sessionId && calendarHref ? calendarHref(sessionId) : null;
                return (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {/* Green, the colour of "you're booked" on the activity's own page. */}
                    <Badge variant="success">Booked</Badge>
                    {/* A plain <a>, not <Link>: it is a file, not a page, and must not be
                        prefetched. No `download` either - iOS would save it rather than
                        offer to add it. */}
                    {ics && (
                      <a href={ics} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-primary underline-offset-4 hover:underline">
                        <CalendarPlus className="size-3.5" aria-hidden="true" />
                        Add to calendar
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* Trailing edge, after the text: the leading edge already belongs to the time
                and the colour bar, and a picture must not push the hour off the row. */}
            {i.image_url && <AgendaImage src={i.image_url} title={i.title} />}
          </div>
        );
      })}
      {todays.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled on this day.</p>}
      </PendingSwap>
    </div>
    </PendingScope>
  );
}

/**
 * An image the organiser placed in the day (D196): shown whole across the column, with its
 * caption beneath. A row with no URL cannot exist (the database requires one), but rendering
 * nothing beats rendering a broken image if one ever does.
 */
function ImageRow({ item }: { item: AgendaItem }) {
  if (!item.image_url) return null;
  return (
    <figure className="flex flex-col gap-2">
      <AgendaImage src={item.image_url} title={item.title || "Agenda image"} variant="full" />
      {item.title && <figcaption className="px-1 text-sm text-muted-foreground">{item.title}</figcaption>}
    </figure>
  );
}
