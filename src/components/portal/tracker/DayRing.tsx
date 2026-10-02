import { Flame, Trophy } from "lucide-react";
import type { Tracker } from "@/lib/tracker";

const R = 52, C = 2 * Math.PI * R;
const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

/** D374: the day's km against the points steps, the next goal in words, the streak and the week. */
export function DayRing({ t, unit = "km" }: { t: Tracker; unit?: string }) {
  const filled = Math.min(t.km / t.full, 1);
  // A tick at each step, measured clockwise from the top like the arc itself.
  const angle = (at: number) => (Math.min(at / t.full, 1) * 360 - 90) * (Math.PI / 180);
  const headline = [`${t.km} ${unit}${t.isToday ? " today" : ""}`, t.pts !== null ? pts(t.pts) : null].filter(Boolean).join(" · ");
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-success/30 bg-success-soft p-4">
      <svg viewBox="0 0 120 120" className="size-28 shrink-0" role="img" aria-label={`${t.km} of ${t.full} ${unit}`}>
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-success/15" />
        {filled > 0 && (
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-success-strong"
            strokeDasharray={C} strokeDashoffset={C * (1 - filled)} transform="rotate(-90 60 60)" />
        )}
        {t.marks.map((m) => (
          <circle key={m} cx={60 + R * Math.cos(angle(m))} cy={60 + R * Math.sin(angle(m))} r="2.5"
            className={t.km >= m ? "fill-white" : "fill-success-strong/40"} />
        ))}
        <text x="60" y="60" textAnchor="middle" className="fill-foreground text-[26px] font-extrabold tabular-nums">{t.km}</text>
        <text x="60" y="78" textAnchor="middle" className="fill-muted-foreground text-[12px] font-bold">{unit}</text>
      </svg>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="text-lg font-extrabold leading-tight text-success-strong">{headline}</div>
        <div className="text-sm text-foreground/80">{goalText(t, unit)}</div>
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs font-bold">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1">
            <Flame aria-hidden className="size-3.5" />{t.streak} day{t.streak === 1 ? "" : "s"} in a row
          </span>
          {t.weekPts !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1">
              <Trophy aria-hidden className="size-3.5" />This week · {t.weekPts} pts
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The line under the headline. `goal` null means nothing left to reach: the top step with
 * points steps, the daily minimum without. The next goal is only offered for today - there is
 * no backdating (D373), so "0.8 km more" on a past day would ask for something impossible.
 */
function goalText(t: Tracker, unit: string): string {
  if (!t.goal) return t.pts !== null ? "Top score reached" : "Day logged";
  if (t.isToday) return t.goal.pts > 0 ? `${t.goal.gap} ${unit} more for ${pts(t.goal.pts)}` : `${t.goal.gap} ${unit} more to log the day`;
  const day = t.days.find((d) => d.day === t.selected);
  if (day?.state === "future") return "Still to come";
  return day?.logged ? "Day logged" : "Not logged";
}
