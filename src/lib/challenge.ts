import { daysBetween } from "@/lib/time";
import type { ChallengeScoring, DailyStep, RegistrationQuestion } from "@/lib/types";

/**
 * The calendar and points arithmetic of a scored challenge (D372, D376, D378). Pure: every day is
 * a Malaysian `YYYY-MM-DD` already, stepped at UTC midnight the way `lastDays` does, so nothing
 * here depends on the server's timezone.
 */

export type ChallengeWeek = { number: number; days: string[] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A runaway date range is bad data; a year of weeks is far beyond any challenge. */
const MAX_WEEKS = 60;

export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

export function inChallenge(s: Pick<ChallengeScoring, "starts_on" | "ends_on">, day: string): boolean {
  return day >= s.starts_on && day <= s.ends_on;
}

/** Km sums are shown and compared to two places; floating point must not make 2.9999 out of 3. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * D378: Mon–Sun weeks, cut to the challenge's dates (Mileage's last week is Mon–Fri), numbered
 * from the week the EVENT starts in, so the EDM's "Week 2 to Week 10" falls out of the dates
 * rather than being typed in.
 */
export function challengeWeeks(s: Pick<ChallengeScoring, "starts_on" | "ends_on">, eventStartsOn: string | null): ChallengeWeek[] {
  const origin = mondayOf(eventStartsOn && eventStartsOn <= s.starts_on ? eventStartsOn : s.starts_on);
  const weeks: ChallengeWeek[] = [];
  for (let mon = mondayOf(s.starts_on); mon <= s.ends_on && weeks.length < MAX_WEEKS; mon = addDays(mon, 7)) {
    const days = Array.from({ length: 7 }, (_, k) => addDays(mon, k)).filter((d) => inChallenge(s, d));
    weeks.push({ number: Math.round(daysBetween(origin, mon) / 7) + 1, days });
  }
  return weeks;
}

export function weekFor(weeks: ChallengeWeek[], day: string): ChallengeWeek | null {
  return weeks.find((w) => w.days.includes(day)) ?? null;
}

/** "Week 2 · 5–11 Oct", or "Week 5 · 26 Oct – 1 Nov" when the week crosses a month. */
export function weekLabel(w: ChallengeWeek): string {
  const [first, last] = [w.days[0], w.days[w.days.length - 1]];
  const d = (s: string) => Number(s.slice(8, 10));
  const m = (s: string) => MONTHS[Number(s.slice(5, 7)) - 1];
  const range = m(first) === m(last) ? `${d(first)}–${d(last)} ${m(last)}` : `${d(first)} ${m(first)} – ${d(last)} ${m(last)}`;
  return `Week ${w.number} · ${range}`;
}

/** D377: the highest step at or below the total; steps are ascending (`parseSteps` makes sure). */
export function stepPoints(km: number, steps: DailyStep[]): number {
  let pts = 0;
  for (const s of steps) if (km >= s.at) pts = s.pts;
  return pts;
}

export function nextStep(km: number, steps: DailyStep[]): DailyStep | null {
  return steps.find((s) => km < s.at) ?? null;
}

const STEPS_HELP = "Write the points steps as km=points, separated by commas, like 1=1, 3=2, 5=4.";

export function parseSteps(text: string): DailyStep[] {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const steps = parts.map((p) => {
    const m = /^(\d+(?:\.\d+)?)\s*=\s*(\d+)$/.exec(p);
    if (!m) throw new Error(STEPS_HELP);
    return { at: Number(m[1]), pts: Number(m[2]) };
  });
  steps.forEach((s, i) => {
    if (i > 0 && s.at <= steps[i - 1].at) throw new Error("List the points steps smallest first, each km once.");
  });
  return steps;
}

export function stepsText(steps: DailyStep[] | undefined): string {
  return (steps ?? []).map((s) => `${s.at}=${s.pts}`).join(", ");
}

/**
 * The Setup tab's Scoring section (D372, D376). Null when it is switched off. Throws the
 * sentence the organiser reads. `questions` is the list being saved in the same post, so a
 * number question added in this very save can already be picked.
 */
export function readScoring(get: (key: string) => string | null, questions: RegistrationQuestion[]): ChallengeScoring | null {
  if (get("scoring_on") !== "on") return null;
  const val = (k: string) => get(k)?.trim() ?? "";
  const metric_key = val("scoring_metric");
  const metric = questions.find((q) => q.key === metric_key);
  if (!metric || metric.type !== "number") throw new Error("Pick the number question that holds the score.");
  const starts_on = val("scoring_starts_on"), ends_on = val("scoring_ends_on");
  if (!DAY.test(starts_on) || !DAY.test(ends_on)) throw new Error("Scoring needs a start and an end date.");
  if (ends_on < starts_on) throw new Error("The scoring end date is before its start date.");
  const daily_min = Number(val("scoring_daily_min"));
  if (!Number.isFinite(daily_min) || daily_min <= 0) throw new Error("The daily minimum must be a number above 0.");
  const daily_steps = parseSteps(val("scoring_steps"));
  const bonusRaw = val("scoring_team_bonus");
  const team_bonus = bonusRaw === "" ? null : Number(bonusRaw);
  if (team_bonus !== null && (!Number.isInteger(team_bonus) || team_bonus < 0)) throw new Error("The team bonus must be a whole number.");
  const podium = val("scoring_podium").split(",").map((p) => p.trim()).filter(Boolean).map(Number);
  if (podium.some((p) => !Number.isInteger(p) || p < 0)) throw new Error("Write the podium points as whole numbers, like 20, 12, 6.");
  return {
    metric_key, daily_min, starts_on, ends_on,
    ...(daily_steps.length ? { daily_steps } : {}),
    ...(team_bonus ? { team_bonus } : {}),
    ...(podium.length ? { podium } : {}),
  };
}
