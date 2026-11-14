// The hours of the day Slime Splat may be started in, and the Malaysia day its daily limits
// count by (D907, D908). Pure and plain arithmetic (Malaysia is UTC+8 all year, no Intl), so the
// server, the browser and the tests all read the clock the same way. The database checks the
// same things again in qualifier_start (0139).

/** Flat pairs of minutes of the Malaysia day, [from, to, from, to…], ascending, `to` exclusive. Null: any time. */
export type PlayHours = number[] | null;
/** A practice run never counts; an official one may go on the leaderboard (D907). */
export type RunKind = "practice" | "official";

const MIN = 60_000;
const DAY_MIN = 1440;
const DAY = DAY_MIN * MIN;
const KL = 8 * 60 * MIN;

/** Minute of the Malaysia day at `now` (epoch ms). */
export const klMinute = (now: number): number => Math.floor((((now + KL) % DAY) + DAY) % DAY / MIN);
/** Epoch ms of the Malaysia midnight at or before `now`. */
export const klDayStart = (now: number): number => Math.floor((now + KL) / DAY) * DAY - KL;
/** The Malaysia date at `now`, "YYYY-MM-DD". */
export const klDay = (now: number): string => new Date(now + KL).toISOString().slice(0, 10);

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minute: number): string => {
  const h = Math.floor(minute / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(minute % 60)} ${h < 12 ? "am" : "pm"}`;
};
/** "12:00 pm" for an epoch ms, Malaysia time. */
export const klClock = (ms: number): string => clock(klMinute(ms));

const PAIR = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

/**
 * The admin's field: "00:00-10:00, 12:00-14:00, 19:00-24:00", 24-hour. Blank is null (any
 * time). Each pair must end after it starts and start no earlier than the one before ended;
 * 24:00 is the end of the day. Anything else is "invalid".
 */
export function parsePlayHours(text: string): PlayHours | "invalid" {
  const t = text.trim();
  if (!t) return null;
  const out: number[] = [];
  for (const part of t.split(",")) {
    const m = PAIR.exec(part.trim());
    if (!m) return "invalid";
    const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (m1 > 59 || m2 > 59) return "invalid";
    const from = h1 * 60 + m1;
    const to = h2 * 60 + m2;
    if (to > DAY_MIN || from >= to || from < (out.at(-1) ?? 0)) return "invalid";
    out.push(from, to);
  }
  return out;
}

/** The field's text for stored hours. */
export function formatPlayHours(h: PlayHours): string {
  if (!h) return "";
  const hhmm = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  const parts: string[] = [];
  for (let i = 0; i + 1 < h.length; i += 2) parts.push(`${hhmm(h[i])}-${hhmm(h[i + 1])}`);
  return parts.join(", ");
}

/** For players: "before 10:00 am, 12:00 pm – 2:00 pm, after 7:00 pm". */
export function hoursText(h: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < h.length; i += 2) {
    const [from, to] = [h[i], h[i + 1]];
    if (from === 0 && to === DAY_MIN) parts.push("at any time");
    else if (from === 0) parts.push(`before ${clock(to)}`);
    else if (to === DAY_MIN) parts.push(`after ${clock(from)}`);
    else parts.push(`${clock(from)} – ${clock(to)}`);
  }
  return parts.join(", ");
}

/** Whether a run may start now; when not, `opensAt` is the next opening (tomorrow's first, after the last pair). */
export function hoursState(h: PlayHours, now: number): { open: true } | { open: false; opensAt: number } {
  if (!h || h.length < 2) return { open: true };
  const m = klMinute(now);
  const day = klDayStart(now);
  for (let i = 0; i + 1 < h.length; i += 2) {
    if (m < h[i]) return { open: false, opensAt: day + h[i] * MIN };
    if (m < h[i + 1]) return { open: true };
  }
  return { open: false, opensAt: day + DAY + h[0] * MIN };
}

/** A runs-a-day field: blank is null (no limit), a whole number 0 to 99, anything else "invalid". */
export function parsePerDay(text: string): number | null | "invalid" {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) return "invalid";
  return Number(t);
}
