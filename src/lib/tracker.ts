import { addDays, challengeWeeks, inChallenge, nextStep, round2, stepPoints, weekFor, type ChallengeWeek } from "@/lib/challenge";
import type { ActivitySubmission, ChallengeScoring } from "@/lib/types";

/**
 * Everything the attendee's tracker page draws (D374), from their own entries alone. Pure;
 * the page fetches, this decides. Team points are Phase 2's `scoreChallenge`, not this.
 */

export type DayState = "logged" | "today" | "missed" | "future";
export type TrackerDay = { day: string; label: string; state: DayState; logged: boolean };
export type Tracker = {
  week: ChallengeWeek;
  /** First day of the previous / next week to link to; null at the ends, and for a week not yet begun. */
  prev: string | null;
  next: string | null;
  days: TrackerDay[];
  selected: string;
  isToday: boolean;
  /** The selected day's live total. */
  km: number;
  /** Null when the challenge has no points steps. */
  pts: number | null;
  goal: { at: number; pts: number; gap: number } | null;
  /** Where the ring's ticks go, and the total that fills it. */
  marks: number[];
  full: number;
  streak: number;
  weekPts: number | null;
  /** The selected day's entries, oldest first, revoked ones included so the attendee sees what was removed. */
  entries: ActivitySubmission[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function metricKm(s: Pick<ActivitySubmission, "answers">, key: string): number {
  const n = Number(s.answers[key]);
  return Number.isFinite(n) ? n : 0;
}

/** Live entries only (D339): a revoked workout never counts toward a day. */
export function dailyKm(entries: Pick<ActivitySubmission, "answers" | "status" | "submitted_on">[], key: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of entries) {
    if (s.status !== "submitted") continue;
    m.set(s.submitted_on, round2((m.get(s.submitted_on) ?? 0) + metricKm(s, key)));
  }
  return m;
}

export function buildTracker(input: {
  scoring: ChallengeScoring;
  eventStartsOn: string | null;
  entries: ActivitySubmission[];
  today: string;
  requested: string | null;
}): Tracker | null {
  const { scoring, entries, today } = input;
  const weeks = challengeWeeks(scoring, input.eventStartsOn);
  if (weeks.length === 0) return null;
  const first = weeks[0].days[0];
  const last = weeks[weeks.length - 1].days[weeks[weeks.length - 1].days.length - 1];
  const clamp = (d: string) => (d < first ? first : d > last ? last : d);
  const selected = clamp(input.requested && DAY.test(input.requested) ? input.requested : today);
  const week = weekFor(weeks, selected)!;
  const i = weeks.indexOf(week);

  const km = dailyKm(entries, scoring.metric_key);
  const logged = (d: string) => (km.get(d) ?? 0) >= scoring.daily_min;
  const days = week.days.map((day): TrackerDay => ({
    day,
    label: WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()],
    logged: logged(day),
    state: day === today ? "today" : day < today ? (logged(day) ? "logged" : "missed") : "future",
  }));

  const steps = scoring.daily_steps ?? [];
  const selKm = km.get(selected) ?? 0;
  const step = steps.length ? nextStep(selKm, steps) : selKm < scoring.daily_min ? { at: scoring.daily_min, pts: 0 } : null;
  const marks = steps.length ? steps.map((s) => s.at) : [scoring.daily_min];

  // D374: the streak ends today, or yesterday while today is still to be logged - an evening
  // walker should not see their streak read 0 every morning.
  let streak = 0;
  for (let d = logged(today) ? today : addDays(today, -1); inChallenge(scoring, d) && logged(d); d = addDays(d, -1)) streak++;

  return {
    week,
    prev: i > 0 ? weeks[i - 1].days[0] : null,
    next: i < weeks.length - 1 && weeks[i + 1].days[0] <= today ? weeks[i + 1].days[0] : null,
    days,
    selected,
    isToday: selected === today,
    km: selKm,
    pts: steps.length ? stepPoints(selKm, steps) : null,
    goal: step ? { at: step.at, pts: step.pts, gap: round2(step.at - selKm) } : null,
    marks,
    full: marks[marks.length - 1],
    streak,
    weekPts: steps.length ? week.days.filter((d) => d <= today).reduce((t, d) => t + stepPoints(km.get(d) ?? 0, steps), 0) : null,
    entries: entries.filter((s) => s.submitted_on === selected).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}
