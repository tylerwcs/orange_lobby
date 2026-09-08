import Link from "next/link";
import type { AgendaItem } from "@/lib/types";
import { isNow } from "@/lib/agenda";
import { Pill } from "@/components/ui/Card";
import { shortDate } from "@/lib/text";

export function AgendaList({ items, day, days, basePath, now }: { items: AgendaItem[]; day: string | null; days: string[]; basePath: string; now: { date: string; time: string } }) {
  if (!day) return <p className="text-sm text-muted">Agenda will be published soon.</p>;
  const todays = items.filter((i) => i.day === day);
  return (
    <div className="flex flex-col gap-3">
      {days.length > 1 && (
        <div className="flex gap-5 border-b border-line">
          {days.map((d) => (
            <Link key={d} href={`${basePath}/agenda?day=${d}`} className={`-mb-px border-b-[3px] pb-2 text-[13px] ${d === day ? "border-brand font-extrabold text-brand-ink" : "border-transparent font-semibold text-muted"}`}>{shortDate(d)}</Link>
          ))}
        </div>
      )}
      {todays.map((i) => {
        const live = isNow(i, now.date, now.time);
        return (
          <div key={i.id} className={`flex gap-3 rounded-[14px] bg-surface p-3.5 ${live ? "border-2 border-brand" : "border border-line"}`}>
            <div className="w-11 shrink-0">
              <div className={`text-[13px] font-extrabold ${live ? "text-brand-ink" : "text-muted"}`}>{i.starts_at}</div>
              {live ? <div className="text-[10px] font-extrabold tracking-[0.08em] text-brand-ink">NOW</div> : i.ends_at && <div className="text-[10px] text-muted">{i.ends_at}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">{i.title}</div>
              {i.location && <div className="text-xs text-muted">{i.location}</div>}
              {i.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{i.description}</p>}
              {i.categories && i.categories.length > 0 && <div className="mt-1.5"><Pill>{i.categories.join(", ")}</Pill></div>}
            </div>
          </div>
        );
      })}
      {todays.length === 0 && <p className="text-sm text-muted">Nothing scheduled on this day.</p>}
    </div>
  );
}
