import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Flame, X } from "lucide-react";
import { weekLabel } from "@/lib/challenge";
import { shortDate } from "@/lib/text";
import type { Tracker } from "@/lib/tracker";

/**
 * D374: the day picker and the week as chips - the team bonus at a glance, since one missed day
 * sinks it. Links, not state: a day is a URL (`?day=`), so Back works and the server draws it.
 * The chips share the row with `gap-1` so seven of them stay at least 44 px wide at 375 px.
 */
export function WeekStrip({ t, href }: { t: Tracker; href: (day: string) => string }) {
  const nav = "flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-border";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {t.prev
          ? <Link href={href(t.prev)} aria-label="Previous week" className={nav}><ChevronLeft aria-hidden className="size-5" /></Link>
          : <span aria-hidden className="size-11 shrink-0" />}
        <div className="min-w-0 text-center">
          <div className="text-base font-extrabold">{t.isToday ? "Today" : shortDate(t.selected)}</div>
          <div className="text-xs text-muted-foreground">{weekLabel(t.week)}</div>
        </div>
        {t.next
          ? <Link href={href(t.next)} aria-label="Next week" className={nav}><ChevronRight aria-hidden className="size-5" /></Link>
          : <span aria-hidden className="size-11 shrink-0" />}
      </div>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${t.days.length}, minmax(0, 1fr))` }}>
        {t.days.map((d) => {
          const selected = d.day === t.selected;
          return (
            <li key={d.day}>
              <Link
                href={href(d.day)}
                aria-current={selected ? "date" : undefined}
                aria-label={`${shortDate(d.day)}: ${d.state === "future" ? "to come" : d.logged ? "logged" : d.state === "today" ? "not logged yet" : "missed"}`}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <span className={d.state === "today" ? "text-primary" : "text-muted-foreground"}>{d.label}</span>
                <DayMark state={d.state} logged={d.logged} />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** D374's chip states: a check when logged, today highlighted with a flame once logged, a faded ✕ when missed. */
function DayMark({ state, logged }: { state: Tracker["days"][number]["state"]; logged: boolean }) {
  const dot = "flex size-7 items-center justify-center rounded-full";
  if (state === "today") {
    return logged
      ? <span aria-hidden className={`${dot} bg-success-soft text-success-strong`}><Flame className="size-4" /></span>
      : <span aria-hidden className={`${dot} border-2 border-dashed border-primary/50 bg-primary/10`} />;
  }
  if (state === "logged") return <span aria-hidden className={`${dot} bg-success-soft text-success-strong`}><Check className="size-4" /></span>;
  if (state === "missed") return <span aria-hidden className={`${dot} bg-muted text-muted-foreground/60`}><X className="size-4" /></span>;
  return <span aria-hidden className={`${dot} bg-muted`} />;
}
