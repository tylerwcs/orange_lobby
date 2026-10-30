// Ranks, streaks, skins and the result line (D768). None of it touches the score: the score
// is wpm and nothing else (D767). Pure, shared by the result screen and the server.
import { FINALISTS } from "./scoring";

export type Tier = "cadet" | "pilot" | "commander" | "ace";

export const TIER_LABELS: Record<Tier, string> = {
  cadet: "Cadet",
  pilot: "Pilot",
  commander: "Commander",
  ace: "Ace",
};

/** Cadet < 40, Pilot 40-60, Commander 60-80, Ace 80+. No run yet is a Cadet. */
export function tierOf(best: number | null): Tier {
  if (best === null || best < 40) return "cadet";
  if (best < 60) return "pilot";
  if (best < 80) return "commander";
  return "ace";
}

const DAY_MS = 86_400_000;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dayBefore = (d: string) => new Date(dayMs(d) - DAY_MS).toISOString().slice(0, 10);

/**
 * Consecutive days with a run, counted back from `today` (a Malaysian calendar day), or from
 * yesterday while today has no run yet, so the streak is not lost before the day is over.
 */
export function streakDays(days: readonly string[], today: string): number {
  if (Number.isNaN(dayMs(today))) return 0;
  const have = new Set(days);
  let d = have.has(today) ? today : dayBefore(today);
  let n = 0;
  while (have.has(d)) {
    n++;
    d = dayBefore(d);
  }
  return n;
}

export const SKINS = ["violet", "teal", "coral", "sky", "amber", "gold"] as const;
export type SkinId = (typeof SKINS)[number];

/** violet: a first run; teal: 10 runs; coral: a 3-day streak; sky/amber/gold: Pilot/Commander/Ace. */
export function unlockedSkins(p: { runs: number; streak: number; best: number | null }): SkinId[] {
  const tier = tierOf(p.best);
  const has: Record<SkinId, boolean> = {
    violet: p.runs >= 1,
    teal: p.runs >= 10,
    coral: p.streak >= 3,
    sky: tier !== "cadet",
    amber: tier === "commander" || tier === "ace",
    gold: tier === "ace",
  };
  return SKINS.filter((s) => has[s]);
}

const gap = (n: number) => n.toFixed(1);

/**
 * The one line under the result. First run, then a new best (top 10, or the gap to the cut),
 * then the gap to the best. Equal to the best is not a new best.
 */
export function nearMiss(r: { wpm: number; prevBest: number | null; rank: number | null; cutWpm: number | null }): string {
  if (r.prevBest === null) return `First flight: ${r.wpm} wpm`;
  if (r.wpm > r.prevBest) {
    // With fewer than 10 players there is no cut: the rank alone says whether they are in.
    const inTop = r.rank !== null && r.rank <= FINALISTS;
    if (inTop) return "New best! You're in the top 10!";
    if (r.cutWpm !== null && gap(r.cutWpm - r.wpm) !== "0.0" && r.cutWpm > r.wpm) {
      return `New best! ${gap(r.cutWpm - r.wpm)} wpm to the top 10`;
    }
    return "New best!";
  }
  if (r.wpm === r.prevBest) return "Matched your best";
  return `Only ${gap(r.prevBest - r.wpm)} short of your best`;
}

export type Entry = { wpm: number; accuracy: number; at: string };

/**
 * Standing order: higher wpm, then higher accuracy, then the earlier best run. The pure mirror
 * of the SQL `order by` that ranks the board.
 */
export function byStanding(a: Entry, b: Entry): number {
  if (a.wpm !== b.wpm) return b.wpm - a.wpm;
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}
