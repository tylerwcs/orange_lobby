import type { EventStatus } from "@/lib/types";
import { ADDON_KEYS, FEATURES, type FeatureKey, type Origin } from "./catalogue";
import { has, type FeatureSet } from "./features";

/** One event as the all-events list sees it: which add-ons it has and which options it is using (D780). */
export type UsageRow = {
  eventId: string;
  eventName: string;
  status: EventStatus;
  startsOn: string | null;
  features: FeatureSet;
  options: Set<string>;
};

/** Something the quarterly review looks at: an add-on or an option with an origin, and the events using it (D782). */
export type ReviewEntry = {
  key: string;
  name: string;
  /** The feature an option belongs to; an add-on has none. */
  parent?: FeatureKey;
  experimental: boolean;
  origin: Origin;
  /** False for an option with no `inUse` check: who uses it is unknown, so `users` is empty and it is never flagged. */
  tracked: boolean;
  users: UsageRow[];
};

export type ReviewFlag = { entry: ReviewEntry; oneClient: boolean; goneQuiet: boolean };

/** The day three calendar months before `today` (YYYY-MM-DD), held to the end of a shorter month. */
function threeMonthsBefore(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const months = y * 12 + (m - 1) - 3;
  const ny = Math.floor(months / 12);
  const nm = months % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/**
 * The entries worth a look this quarter (D782), each with the reasons. `today` is a Malaysian calendar day
 * (`nowInKL().date`), passed in so this stays pure.
 * An entry whose usage is not tracked is never flagged: nobody can say whether it is used.
 * - oneClient: experimental, and at most one event uses it. Built for one client, still not proven on a second.
 * - goneQuiet: shipped more than three months ago, and no event starting in the last three months (or later) uses it.
 *   Events with no start date say nothing about recency. An origin month counts as its first day.
 */
export function reviewFlags(entries: ReviewEntry[], today: string): ReviewFlag[] {
  const cutoff = threeMonthsBefore(today);
  return entries
    .filter((entry) => entry.tracked)
    .map((entry) => {
      const oneClient = entry.experimental && entry.users.length <= 1;
      const old = `${entry.origin.date}-01` < cutoff;
      const goneQuiet = old && !entry.users.some((r) => r.startsOn != null && r.startsOn >= cutoff);
      return { entry, oneClient, goneQuiet };
    })
    .filter((f) => f.oneClient || f.goneQuiet);
}

/** The entries whose usage cannot be told (D782): options with an origin but no `inUse` check. Shown as such, not as unused. */
export function untrackedEntries(entries: readonly ReviewEntry[]): ReviewEntry[] {
  return entries.filter((e) => !e.tracked);
}

/**
 * Every add-on, and every option, that has an origin (D782). Core features are never reviewed. An option with no
 * `inUse` check has no reliable users, so it comes back `tracked: false` with none, rather than looking unused.
 */
export function reviewEntries(rows: readonly UsageRow[]): ReviewEntry[] {
  const out: ReviewEntry[] = [];
  for (const key of ADDON_KEYS) {
    const f = FEATURES[key];
    if (f.origin) out.push({ key, name: f.name, experimental: f.tier === "experimental", origin: f.origin, tracked: true, users: rows.filter((r) => has(r.features, key)) });
  }
  for (const [parent, f] of Object.entries(FEATURES) as [FeatureKey, (typeof FEATURES)[FeatureKey]][]) {
    for (const o of f.options) {
      if (o.origin) out.push({ key: o.key, name: o.name, parent, experimental: !!o.experimental, origin: o.origin, tracked: !!o.inUse, users: o.inUse ? rows.filter((r) => r.options.has(o.key)) : [] });
    }
  }
  return out;
}

/** The user with the latest start date; with no dates at all, the first (the list is newest-created first). */
export function latestOf(users: readonly UsageRow[]): UsageRow | undefined {
  let best: UsageRow | undefined;
  for (const r of users) {
    if (!best || (r.startsOn != null && (best.startsOn == null || r.startsOn > best.startsOn))) best = r;
  }
  return best;
}
