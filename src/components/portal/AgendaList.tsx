import type { AgendaItem } from "@/lib/types";
import { isNow } from "@/lib/agenda";
import { agendaAccentClass } from "@/lib/agenda-colours";
import { isBreakout } from "@/lib/breakouts";
import { isBookedRow } from "@/lib/activities";
import { Badge } from "@/components/ui/badge";
import { AgendaImage } from "./AgendaImage";
import { shortDate } from "@/lib/text";
import { Skeleton } from "@/components/ui/skeletons";
import { PendingLink, PendingScope, PendingSwap } from "@/components/PendingNav";

/** What a day looks like while the next one loads: the shape of a few sessions. */
const DaySkeleton = () => (
  <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading the day">
    {["h-[76px]", "h-[116px]", "h-[76px]"].map((h, i) => <Skeleton key={i} className={`${h} rounded-[14px]`} />)}
  </div>
);

export function AgendaList({ items, day, days, basePath, now, dayHref }: {
  items: AgendaItem[];
  day: string | null;
  days: string[];
  basePath: string;
  now: { date: string; time: string };
  /** Where a day tab goes. Defaults to the agenda page; the desktop home points at itself. */
  dayHref?: (day: string) => string;
}) {
  const hrefForDay = dayHref ?? ((d: string) => `${basePath}/agenda?day=${d}`);
  if (!day) return <p className="text-sm text-muted-foreground">Agenda will be published soon.</p>;
  const todays = items.filter((i) => i.day === day);
  return (
    // The day tabs change only `?day=`, which no loading.tsx sees; the scope moves the
    // underline at once and swaps the sessions for a skeleton until the day arrives.
    <PendingScope>
    <div className="flex flex-col gap-3">
      {days.length > 1 && (
        <div className="flex gap-5 border-b border-border">
          {days.map((d) => (
            <PendingLink
              key={d}
              href={hrefForDay(d)}
              selected={d === day}
              className="-mb-px border-b-[3px] pb-2 text-[13px]"
              selectedClassName="border-primary font-extrabold text-primary"
              unselectedClassName="border-transparent font-semibold text-muted-foreground"
            >
              {shortDate(d)}
            </PendingLink>
          ))}
        </div>
      )}
      <PendingSwap fallback={<DaySkeleton />}>
      {todays.map((i) => {
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
              {isBookedRow(i) && <div className="mt-1.5"><Badge>Booked</Badge></div>}
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
