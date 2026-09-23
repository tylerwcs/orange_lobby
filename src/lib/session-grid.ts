import type { SeatsForViewer } from "@/lib/activities";

/**
 * How the booking sheet lays out an activity's sessions: one tab per day, and within a day a
 * grid of start times split into parts of the day. Time is what an attendee chooses by, so it
 * is the only thing every slot carries; everything else is said once, and only when it helps.
 * Sessions have no titles (migration 0032): the activity is the name, a slot is only a time.
 *
 * - The room prints once for the activity when every session shares it; when they differ, the
 *   sheet names it for the selected session instead.
 * - The length prints once when every session has the same one.
 */
export type Period = "Morning" | "Afternoon" | "Evening";

const PERIODS: Period[] = ["Morning", "Afternoon", "Evening"];

export function periodOf(hhmm: string): Period {
  const hour = Number(hhmm.slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

export type GridDay<T extends SeatsForViewer = SeatsForViewer> = {
  day: string;
  periods: { period: Period; slots: T[] }[];
  /** The attendee holds a seat on this day. */
  mine: boolean;
  /** A slot on this day could still be taken by this attendee. */
  open: boolean;
};

export type SessionGrid<T extends SeatsForViewer = SeatsForViewer> = {
  days: GridDay<T>[];
  /** The one room every session is in, or null when they differ or none is set. */
  location: string | null;
  /** The one length every session runs, in minutes, or null. */
  minutes: number | null;
};

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function shared<V>(values: V[]): V | null {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null;
}

export function sessionGrid<T extends SeatsForViewer>(seats: T[]): SessionGrid<T> {
  const sorted = [...seats].sort((a, b) =>
    a.session.day.localeCompare(b.session.day)
    || a.session.starts_at.localeCompare(b.session.starts_at)
    || a.session.sort_order - b.session.sort_order);

  const byDay = new Map<string, T[]>();
  for (const s of sorted) byDay.set(s.session.day, [...(byDay.get(s.session.day) ?? []), s]);

  const days = [...byDay].map(([day, slots]): GridDay<T> => ({
    day,
    periods: PERIODS
      .map((period) => ({ period, slots: slots.filter((s) => periodOf(s.session.starts_at) === period) }))
      .filter((p) => p.slots.length > 0),
    mine: slots.some((s) => s.mine),
    open: slots.some((s) => !s.mine && !s.full),
  }));

  const lengths = sorted.map((s) => (s.session.ends_at ? toMinutes(s.session.ends_at) - toMinutes(s.session.starts_at) : null));
  return {
    days,
    location: shared(sorted.map((s) => s.session.location)),
    minutes: lengths.includes(null) ? null : shared(lengths),
  };
}

/**
 * The day the sheet opens on: where the attendee's own seat is, since that is what they came
 * back to look at; otherwise the first day with room; otherwise the first day at all.
 */
export function startDay(days: GridDay[]): string | null {
  return (days.find((d) => d.mine) ?? days.find((d) => d.open) ?? days[0])?.day ?? null;
}
