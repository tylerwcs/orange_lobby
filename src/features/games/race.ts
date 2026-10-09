import type { Attendee } from "@/lib/types";
import { fieldValue } from "@/lib/attendee-values";

/**
 * How a race's lanes are made (D263): the attendee's category (its first part, when it lists
 * several programmes — see `laneKeyFor`), any attendee field the event defines (table, company
 * and department are ordinary fields in `extra`), or every player alone.
 */
export type Grouping = { by: "solo" } | { by: "category" } | { by: "field"; key: string; label: string };

export const OTHERS = "__others";
export const TAP_RATE = 15;
export const TAP_ELAPSED_CAP_S = 3;
/** Lanes the LED shows at once (D363): up to 30 across 1920 px, thinning as more join. */
export const MAX_LANES = 30;
/** How long after GO the LED holds its columns (D364): time for every phone's first batch or two. */
export const HOLD_AFTER_GO_MS = 2500;

export function parseGrouping(raw: unknown): Grouping {
  const r = raw as { by?: unknown; key?: unknown; label?: unknown } | null | undefined;
  if (r?.by === "category") return { by: "category" };
  if (r?.by === "field" && typeof r.key === "string" && r.key) {
    return { by: "field", key: r.key, label: typeof r.label === "string" && r.label ? r.label : r.key };
  }
  return { by: "solo" };
}

/**
 * The lane a player races in. Snapshotted when they join (D264). By category it is the
 * category's FIRST part, trimmed, case kept: "KOM, Wellness" races for KOM. The separators are
 * the ones `categoryParts` in `@/lib/agenda` splits on; that helper lower-cases, and a lane key
 * is shown on the LED, so the split is repeated here rather than reused.
 */
export function laneKeyFor(a: Pick<Attendee, "id" | "category" | "extra">, g: Grouping): string {
  if (g.by === "solo") return a.id;
  const v = g.by === "category" ? firstCategoryPart(a.category) : fieldValue(a, g.key);
  return v || OTHERS;
}

function firstCategoryPart(category: string | null): string {
  return (category ?? "").split(/[,+/;]/).map((p) => p.trim()).find(Boolean) ?? "";
}

/** "Table 7" for a bare number, the value itself otherwise (D263); solo, the player's LED name (D365). */
export function laneLabel(key: string, g: Grouping, labelOf: (id: string) => string = () => ""): string {
  if (key === OTHERS) return "Others";
  if (g.by === "solo") return labelOf(key) || "?";
  if (g.by === "field" && /^\d+$/.test(key)) return `${g.label} ${key}`;
  return key;
}

export type TapRow = { attendee_id: string; lane_key: string; taps: number; joined_at?: string };
export type LaneStanding = { key: string; players: number; active: number; taps: number; score: number; place: number };

/**
 * Lanes ranked by average taps per player who tapped at all (D267). Averaging stops a big
 * table beating a small one by size; leaving out zero-tap players stops someone who joined
 * and put their phone down dragging their lane down.
 */
export function standings(rows: TapRow[]): LaneStanding[] {
  const lanes = new Map<string, { players: number; active: number; taps: number }>();
  for (const r of rows) {
    const l = lanes.get(r.lane_key) ?? { players: 0, active: 0, taps: 0 };
    l.players += 1;
    if (r.taps > 0) { l.active += 1; l.taps += r.taps; }
    lanes.set(r.lane_key, l);
  }
  return [...lanes.entries()]
    .map(([key, l]) => ({ key, ...l, score: l.active ? Math.round((l.taps / l.active) * 10) / 10 : 0 }))
    .sort((a, b) => b.score - a.score || b.taps - a.taps || a.key.localeCompare(b.key))
    .map((l, i) => ({ ...l, place: i + 1 }));
}

export function topTapper(rows: TapRow[]): TapRow | null {
  let best: TapRow | null = null;
  for (const r of rows) if (r.taps > 0 && (!best || r.taps > best.taps)) best = r;
  return best;
}

/**
 * How many of a batch count (D266): at most 15 per second since the player's last accepted
 * batch, with that time capped at 3 s. Mirrors race_add_taps in 0049_games.sql.
 */
export function tapAllowance(n: number, elapsedMs: number): number {
  const want = Math.max(0, Math.floor(n));
  const elapsed = Math.min(Math.max(elapsedMs, 0), TAP_ELAPSED_CAP_S * 1000);
  return Math.min(want, Math.ceil((TAP_RATE * elapsed) / 1000));
}

/**
 * The lobby's cards (D364): the MAX_LANES lanes someone joined most recently, in `list`'s order, so
 * every new joiner sees their card land. The rest are counted on a "+N more" card.
 */
export function lobbyLanes(list: LaneStanding[], rows: TapRow[]): LaneStanding[] {
  if (list.length <= MAX_LANES) return list;
  const last = new Map<string, string>();
  for (const r of rows) {
    const at = r.joined_at ?? "";
    if (at > (last.get(r.lane_key) ?? "")) last.set(r.lane_key, at);
  }
  const at = (k: string) => last.get(k) ?? "";
  const newest = new Set([...list].sort((a, b) => at(b.key).localeCompare(at(a.key)) || a.key.localeCompare(b.key))
    .slice(0, MAX_LANES).map((l) => l.key));
  return list.filter((l) => newest.has(l.key));
}

/**
 * The columns the LED races past MAX_LANES (D364). With nothing held yet: the top MAX_LANES now.
 * Once held: the same lanes to the end, so columns never pop in and out, except that anyone on
 * the podium places swaps in for the held lane placed lowest, so the crown is always on screen.
 * Holding what it returns returns it unchanged.
 */
export function heldLanes(held: string[] | null, lanes: { key: string; place: number }[]): string[] {
  const place = new Map(lanes.map((l) => [l.key, l.place]));
  const at = (k: string) => place.get(k) ?? Infinity;
  const out = held ? [...held] : [...lanes].sort((a, b) => a.place - b.place).slice(0, MAX_LANES).map((l) => l.key);
  for (const l of lanes.filter((x) => x.place <= 3)) {
    if (out.includes(l.key)) continue;
    let worst = -1;
    out.forEach((k, i) => { if (at(k) > 3 && (worst < 0 || at(k) > at(out[worst]))) worst = i; });
    if (worst >= 0) out[worst] = l.key;
  }
  return out;
}

/**
 * How far up its column a lane is on the LED (D303): its score over 110% of the leader's, so the
 * leader never looks finished. Sent instead of the score, so no count is on the wire (D304).
 */
export function progressOf(score: number, leader: number): number {
  return leader > 0 ? Math.min(1, score / (leader * 1.1)) : 0;
}
