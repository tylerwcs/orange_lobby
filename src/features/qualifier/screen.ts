// What Slime Splat's page says (D772, D795, D797): the lines, the board's layout and the
// clock-driven phase. Pure, so the copy and its edge cases are tested without rendering.
import type { BoardEntry } from "./board";
import type { Phase } from "./phase";
import { hoursText, klDay, whenOpens, type PlayHours, type RunKind } from "./hours";

/**
 * The phase the page should show now. The server's phase is read once at load; the window's
 * ends are crossed here by the clock, so "Opens in" turns into Play, and Play into closed,
 * without a reload.
 */
export function livePhase(phase: Phase, opensAt: string | null, closesAt: string | null, now: number): Phase {
  if (phase !== "before" && phase !== "open") return phase;
  const closes = closesAt ? Date.parse(closesAt) : NaN;
  if (now >= closes) return "closed";
  const opens = opensAt ? Date.parse(opensAt) : NaN;
  if (phase === "before" && now >= opens) return "open";
  return phase;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A countdown: "2d 4h", then "3h 05m", then "4:59". Seconds round up, so 0:00 is the end. */
export function untilText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}:${pad(s % 60)}`;
}

const POINTS = new Intl.NumberFormat("en-US");

/** A score as the page prints it: whole points with thousands separators, the same on the server and in the browser. */
export const points = (n: number): string => POINTS.format(n);

/**
 * Where the player stands, in one line, on the ready and result screens: their place on the
 * leaderboard (D797: a plain leaderboard, no finale cut to chase), the top spot said as such.
 */
export function placeLine(p: { best: number | null; rank: number | null; total: number; phase: Phase }): string {
  if (p.best === null || p.rank === null) return p.phase === "open" ? "Play to get on the board" : "You're not on the board";
  if (p.rank === 1) return p.total > 1 ? "You're top of the board!" : "You're on the board!";
  return `You're #${p.rank} of ${p.total}`;
}

/** The last stretch before the close, when the ready screen says a run started now still counts. */
const CLOSING_NOTE_MS = 20 * 60_000;

/** Within 20 minutes of the close: how long is left and that a run started now still counts. Null otherwise. */
export function closingNote(closesAtMs: number, now: number): string | null {
  const left = closesAtMs - now;
  if (!(left > 0 && left <= CLOSING_NOTE_MS)) return null;
  return `Closes in ${Math.ceil(left / 60_000)} min — a run started now still counts.`;
}

/** The ready screen's countdown to the close, shown whenever the window is open (spec). */
export const closesIn = (closesAtMs: number, now: number): string => `Closes in ${untilText(closesAtMs - now)}`;

/** "New best!" on the result: a score over the best before it, or a first run that scored at all. */
export const isNewBest = (score: number, prevBest: number | null): boolean =>
  score > 0 && (prevBest === null || score > prevBest);

export type BoardItem = { kind: "row"; entry: BoardEntry } | { kind: "gap" };

/**
 * The board top to bottom: the top 20, then a gap row when the player's own rows don't follow
 * on, and those rows.
 */
export function boardLayout(top: readonly BoardEntry[], around: readonly BoardEntry[]): BoardItem[] {
  if (top.length === 0 && around.length === 0) return [];
  const items: BoardItem[] = top.map((entry) => ({ kind: "row", entry }));
  if (around.length > 0) {
    const last = top.length > 0 ? top[top.length - 1].rank : 0;
    if (around[0].rank > last + 1) items.push({ kind: "gap" });
    for (const entry of around) items.push({ kind: "row", entry });
  }
  return items;
}

// ---- Practice and official runs, and the play hours (D907, D908, D909). ----

type Limits = { practice: number | null; official: number | null };
type Used = { day: string; practice: number; official: number };

/**
 * What is left today of each kind; null is unlimited. `used` was counted on `used.day`: once
 * the Malaysia day has moved on (a page left open past midnight) nothing is used yet.
 */
export function leftToday(v: { limits: Limits; used: Used }, now: number): Limits {
  const fresh = klDay(now) !== v.used.day;
  const left = (limit: number | null, used: number) => (limit === null ? null : Math.max(0, limit - (fresh ? 0 : used)));
  return { practice: left(v.limits.practice, v.used.practice), official: left(v.limits.official, v.used.official) };
}

/** The counts after a run of `kind` started at `now`: an attempt is used when it starts. */
export function usedAfterStart(used: Used, kind: RunKind, now: number): Used {
  const day = klDay(now);
  const base = used.day === day ? used : { day, practice: 0, official: 0 };
  return { ...base, [kind]: base[kind] + 1 };
}

/** The small line on a kind's button: what is left today. Null when there is no limit. */
export function leftNote(kind: RunKind, left: number | null): string | null {
  if (left === null) return null;
  if (left === 0) return kind === "practice" ? "None left today" : "Used today";
  return `${left} left today`;
}

/**
 * The rules under the buttons, from the settings the event actually set. An event with no
 * daily limits has no kinds to explain: only its hours, when it has any.
 */
export function ruleLines(v: { limits: Limits; playHours: PlayHours }): string[] {
  const { practice, official } = v.limits;
  const kinds = practice !== null || official !== null;
  const lines: string[] = [];
  if (kinds) {
    if (practice === null) lines.push("Practice: as often as you like. Practice runs don't count.");
    else if (practice > 0) lines.push(`Practice: up to ${practice} ${practice === 1 ? "run" : "runs"} a day. They don't count.`);
    if (official === null) lines.push("Official: as often as you like. Your best official attempt goes on the leaderboard.");
    else if (official > 0) lines.push(`Official: ${official} ${official === 1 ? "attempt" : "attempts"} a day. Only official attempts go on the leaderboard.`);
  }
  if (v.playHours && v.playHours.length >= 2) lines.push(`Play ${hoursText(v.playHours)} only.`);
  if (kinds) lines.push("An attempt is used as soon as you press Start.");
  return lines;
}

/** Outside the play hours: when a run may start again, in the words the start route uses. */
export const opensAgain = (opensAt: number, now: number): string => `Opens again at ${whenOpens(opensAt, now)}`;
