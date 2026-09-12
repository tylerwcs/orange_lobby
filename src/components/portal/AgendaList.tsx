import Link from "next/link";
import type { AgendaItem } from "@/lib/types";
import { isNow } from "@/lib/agenda";
import { Badge } from "@/components/ui/badge";
import { shortDate } from "@/lib/text";

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
    <div className="flex flex-col gap-3">
      {days.length > 1 && (
        <div className="flex gap-5 border-b border-border">
          {days.map((d) => (
            <Link key={d} href={hrefForDay(d)} className={`-mb-px border-b-[3px] pb-2 text-[13px] ${d === day ? "border-primary font-extrabold text-primary" : "border-transparent font-semibold text-muted-foreground"}`}>{shortDate(d)}</Link>
          ))}
        </div>
      )}
      {todays.map((i) => {
        const live = isNow(i, now.date, now.time);
        return (
          <div key={i.id} id={live ? "now" : undefined} className={`flex gap-3 rounded-[14px] bg-card p-3.5 scroll-mt-4 ${live ? "border-2 border-primary" : "border border-border"}`}>
            <div className="w-11 shrink-0">
              <div className={`text-[13px] font-extrabold ${live ? "text-primary" : "text-muted-foreground"}`}>{i.starts_at}</div>
              {live ? <div className="text-[11px] font-extrabold tracking-[0.08em] text-primary">NOW</div> : i.ends_at && <div className="text-[11px] text-muted-foreground">{i.ends_at}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">{i.title}</div>
              {i.location && <div className="text-xs text-muted-foreground">{i.location}</div>}
              {i.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{i.description}</p>}
              {i.categories && i.categories.length > 0 && <div className="mt-1.5"><Badge variant="secondary">{i.categories.join(", ")}</Badge></div>}
            </div>
          </div>
        );
      })}
      {todays.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled on this day.</p>}
    </div>
  );
}
