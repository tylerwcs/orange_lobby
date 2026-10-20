import type { TournamentSport } from "./squads";

/**
 * Tournament results (D653-D672). The database keeps only pools, matches and their slots; this
 * module works out the rest - who is in each slot, outcomes, standings, places, points, the
 * overall table - on every read, so a corrected score fixes everything after it (D670). Pure, so
 * the admin tabs, the portal and the export say the same thing.
 */

export type ResultKind = TournamentSport["result_kind"];

/** D655: a group playing a sport, in a pool (0 = Pool A). Manual format: pool 0, and the admin's place. */
export type PoolGroup = { sport_id: string; group_id: string; pool: number; forfeit: boolean; manual_place: number | null };

/** D669: a match or race. Pool matches carry their pool, bracket ones their bracket (0 = Gold). */
export type Match = {
  id: string;
  sport_id: string;
  stage: "pool" | "bracket" | "manual";
  pool: number | null;
  bracket: number | null;
  /** "pool", "semi", "final", "third", "race", or the admin's round name (D665). */
  round: string;
  position: number;
  walkover_to: string | null;
  went_through: string | null;
};

/** D651: a fixed group (null while empty) or a pointer to another match's winner or loser. */
export type Slot = {
  match_id: string;
  slot: number;
  group_id: string | null;
  source_match_id: string | null;
  source_outcome: "winner" | "loser" | null;
  score: number | null;
  time_ms: number | null;
  dnf: boolean;
};

export type SportResults = { sport: TournamentSport; pools: PoolGroup[]; matches: Match[]; slots: Slot[] };

/** What `set_sport_plan` writes: a sport's pools and its matches with their slots, ids chosen here. */
export type MatchPlan = {
  pools: Omit<PoolGroup, "sport_id">[];
  matches: (Omit<Match, "sport_id" | "walkover_to" | "went_through"> & { slots: Pick<Slot, "slot" | "group_id" | "source_match_id" | "source_outcome">[] })[];
};

export const MAX_SCORE = 999;
export const MIN_POOL = 2;
export const MAX_POOL = 8;
const MAX_POINTS_PLACES = 50;

// ---------- words ----------

/** "1st", "2nd", "3rd", "4th" … "11th", "21st". */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Pool A" (D667: "pool", because groups are the teams). */
export const poolName = (i: number) => `Pool ${String.fromCharCode(65 + i)}`;

/** D656: Gold, Silver, Bronze, then "4th placing"… */
export const bracketName = (i: number) => ["Gold", "Silver", "Bronze"][i] ?? `${ordinal(i + 1)} placing`;

/** The places a bracket decides: "places 1–4". */
export const bracketPlaces = (i: number, teams: number) => `places ${i * teams + 1}–${(i + 1) * teams}`;

// ---------- input ----------

/** D658: `1:52.30`, `52.3` or DNF, as whole milliseconds; null for anything else (or zero). */
export function parseTime(text: string): number | "dnf" | null {
  const t = text.trim();
  if (/^dnf$/i.test(t)) return "dnf";
  const m = /^(?:(\d{1,3}):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const sec = Number(m[2]);
  if (m[1] && sec >= 60) return null;
  const ms = (min * 60 + sec) * 1000 + (m[3] ? Number(m[3].padEnd(3, "0")) : 0);
  return ms > 0 ? ms : null;
}

/** "1:52.30", or "52.30" under a minute: hundredths, as a relay is timed. */
export function formatTime(ms: number): string {
  const cs = Math.round(ms / 10);
  const min = Math.floor(cs / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const hund = String(cs % 100).padStart(2, "0");
  return min > 0 ? `${min}:${String(sec).padStart(2, "0")}.${hund}` : `${sec}.${hund}`;
}

/** D654: the points table, 1st first. Blank is no table. Throws the organiser's sentence. */
export function readPlacePoints(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length > MAX_POINTS_PLACES || !parts.every((p) => /^\d{1,5}$/.test(p))) {
    throw new Error("Points per place must be whole numbers, 1st first, separated by commas.");
  }
  return parts.map(Number);
}

/** D674: the full participation bonus. Blank or 0 is none. Throws the organiser's sentence. */
export function readBonus(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d{1,4}$/.test(t)) throw new Error("The participation bonus must be a whole number of points, up to 9999.");
  return Number(t) || null;
}

// ---------- pools and the plan ----------

/** D655/D656: why these groups can't run as pools then placing brackets, or null. */
export function formatProblem(groups: number, poolSize: number, kind: ResultKind): string | null {
  if (groups === 0) return "Tick at least one group to play.";
  if (groups % poolSize !== 0) {
    return `${groups} groups don't split into pools of ${poolSize}. Change the pool size, or switch this sport to Matches I add by hand.`;
  }
  const pools = groups / poolSize;
  if (kind === "score" && pools !== 2 && pools !== 4) return "Placing brackets need 2 or 4 pools. Use Matches I add by hand for this sport.";
  return null;
}

/** D655: the groups ticked by default - any with a squad player in this tournament; everyone if none has. */
export function defaultPlaying(groupIds: string[], counted: { group_id: string }[]): string[] {
  const playing = new Set(counted.map((r) => r.group_id));
  const ticked = groupIds.filter((g) => playing.has(g));
  return ticked.length ? ticked : groupIds;
}

/** D655: a random draw, separate for each sport. */
export function drawPools(groupIds: string[], poolSize: number, random: () => number = Math.random): string[][] {
  const a = [...groupIds];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const pools: string[][] = [];
  for (let i = 0; i < a.length; i += poolSize) pools.push(a.slice(i, i + poolSize));
  return pools;
}

/** Every pair once, round by round (the circle method), so nobody plays twice in a round. */
export function roundRobinPairs(n: number): [number, number][][] {
  const teams = n % 2 === 0 ? [...Array(n).keys()] : [...Array(n).keys(), -1];
  const rounds: [number, number][][] = [];
  for (let r = 0; r < teams.length - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < teams.length / 2; i++) {
      const a = teams[i];
      const b = teams[teams.length - 1 - i];
      if (a !== -1 && b !== -1) round.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(round);
    teams.splice(1, 0, teams.pop()!);
  }
  return rounds;
}

type PlanSlot = MatchPlan["matches"][number]["slots"][number];

/** D673: a time sport's heats - every pool races this many times, the same groups each time. */
export const HEATS = ["heat 1", "heat 2"] as const;

/**
 * D655/D656: a sport's pools, pool matches (round robin) and empty placing brackets - semis,
 * then a final and 3rd-place match fed by pointers (4 pools), or a final (2 pools). Every pool
 * round comes before the brackets. D673: times have no brackets - each pool races once per
 * heat, and best times decide the places.
 */
export function planPools(sport: Pick<TournamentSport, "result_kind">, pools: string[][], newId: () => string): MatchPlan {
  const plan: MatchPlan = { pools: pools.flatMap((ids, pool) => ids.map((group_id) => ({ group_id, pool, forfeit: false, manual_place: null }))), matches: [] };
  let position = 0;
  const add = (m: Omit<MatchPlan["matches"][number], "id" | "position">) => {
    const id = newId();
    plan.matches.push({ ...m, id, position: position++ });
    return id;
  };
  const fixed = (groups: (string | null)[]): PlanSlot[] => groups.map((group_id, slot) => ({ slot, group_id, source_match_id: null, source_outcome: null }));
  const from = (outcome: "winner" | "loser", a: string, b: string): PlanSlot[] =>
    [a, b].map((source_match_id, slot) => ({ slot, group_id: null, source_match_id, source_outcome: outcome }));
  const size = Math.max(0, ...pools.map((p) => p.length));
  const p = pools.length;

  if (sport.result_kind === "time") {
    for (const round of HEATS) pools.forEach((ids, pool) => add({ stage: "pool", pool, bracket: null, round, slots: fixed(ids) }));
    return plan;
  }
  for (const round of roundRobinPairs(size)) {
    pools.forEach((ids, pool) => {
      for (const [a, b] of round) if (ids[a] && ids[b]) add({ stage: "pool", pool, bracket: null, round: "pool", slots: fixed([ids[a], ids[b]]) });
    });
  }
  for (let b = 0; b < size; b++) {
    if (p === 4) {
      const s1 = add({ stage: "bracket", pool: null, bracket: b, round: "semi", slots: fixed([null, null]) });
      const s2 = add({ stage: "bracket", pool: null, bracket: b, round: "semi", slots: fixed([null, null]) });
      add({ stage: "bracket", pool: null, bracket: b, round: "final", slots: from("winner", s1, s2) });
      add({ stage: "bracket", pool: null, bracket: b, round: "third", slots: from("loser", s1, s2) });
    } else {
      add({ stage: "bracket", pool: null, bracket: b, round: "final", slots: fixed(Array(p).fill(null)) });
    }
  }
  return plan;
}

// ---------- resolving ----------

export type Entry = { slot: number; groupId: string | null; pointer: string | null; score: number | null; timeMs: number | null; dnf: boolean; forfeit: boolean };

/** A match as it stands: who is in it, and what came of it (D658-D660). */
export type Resolved = {
  match: Match;
  label: string;
  entries: Entry[];
  played: boolean;
  winner: string | null;
  loser: string | null;
  draw: boolean;
  /** "Draw", "Walkover", "Walkover · X forfeits", "Both forfeit", "X went through", or null. */
  note: string | null;
  /** Races: fastest first, then DNF, then forfeit. Score matches: winner, loser once played. */
  order: string[];
};

/** Whether anything has been entered for this match: a score, a time, a DNF, a walkover or a went-through. */
export function hasResult(match: Pick<Match, "id" | "walkover_to" | "went_through">, slots: Slot[]): boolean {
  return !!match.walkover_to || !!match.went_through || slots.some((s) => s.match_id === match.id && (s.score !== null || s.time_ms !== null || s.dnf));
}

const ROUND_WORDS: Record<string, string> = { final: "Final", third: "3rd place", race: "Final race" };

/** "Pool A", "Gold · Semi 1", "Gold · Final", "Gold · 3rd place", "Gold · Final race", or the admin's round. */
function labels(sr: SportResults): Map<string, { label: string; short: string }> {
  const out = new Map<string, { label: string; short: string }>();
  const semis = new Map<number, number>();
  for (const m of [...sr.matches].sort((a, b) => a.position - b.position)) {
    if (m.stage === "pool") {
      // D673: a time sport's heat names its heat first, "Heat 2 · Pool A".
      const l = m.round.startsWith("heat ") ? `Heat ${m.round.slice(5)} · ${poolName(m.pool ?? 0)}` : poolName(m.pool ?? 0);
      out.set(m.id, { label: l, short: l });
    } else if (m.stage === "bracket") {
      const b = m.bracket ?? 0;
      let round = ROUND_WORDS[m.round] ?? m.round;
      if (m.round === "semi") {
        const n = (semis.get(b) ?? 0) + 1;
        semis.set(b, n);
        round = `Semi ${n}`;
      }
      out.set(m.id, { label: `${bracketName(b)} · ${round}`, short: `${bracketName(b)} ${round}` });
    } else out.set(m.id, { label: m.round, short: m.round });
  }
  return out;
}

/** Fastest first; a DNF after every finisher; no result yet after that; a forfeit always last. */
const raceKey = (e: Pick<Entry, "forfeit" | "dnf" | "timeMs">) => (e.forfeit ? 5e9 : e.dnf ? 2e9 : e.timeMs ?? 4e9);

/**
 * D658-D660: every match of a sport, in order, with pointer slots resolved to the winner or loser
 * they name (null until that match is played). Forfeits make walkovers; two forfeit groups in a
 * bracket match send slot 0 on, so the bracket can still finish (both score 0 anyway).
 */
export function resolveSport(sr: SportResults, names: Map<string, string>): Resolved[] {
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  const label = labels(sr);
  const byId = new Map(sr.matches.map((m) => [m.id, m]));
  const done = new Map<string, Resolved>();
  const name = (g: string) => names.get(g) ?? "A group";
  const time = sr.sport.result_kind === "time";

  const resolve = (m: Match, seen: Set<string>): Resolved => {
    const hit = done.get(m.id);
    if (hit) return hit;
    const entries: Entry[] = sr.slots.filter((s) => s.match_id === m.id).sort((a, b) => a.slot - b.slot).map((s) => {
      let groupId = s.group_id;
      let pointer: string | null = null;
      if (s.source_match_id) {
        const src = byId.get(s.source_match_id);
        pointer = `${s.source_outcome === "loser" ? "Loser" : "Winner"} ${label.get(s.source_match_id)?.short ?? "an earlier match"}`;
        const r = src && !seen.has(src.id) ? resolve(src, new Set([...seen, m.id])) : null;
        groupId = r ? (s.source_outcome === "loser" ? r.loser : r.winner) : null;
      }
      return { slot: s.slot, groupId, pointer, score: s.score, timeMs: s.time_ms, dnf: s.dnf, forfeit: !!groupId && forfeit.has(groupId) };
    });
    const out: Resolved = { match: m, label: label.get(m.id)?.label ?? m.round, entries, played: false, winner: null, loser: null, draw: false, note: null, order: [] };
    const full = entries.length > 0 && entries.every((e) => e.groupId);

    if (time || entries.length > 2) {
      if (full && entries.every((e) => e.forfeit || e.dnf || e.timeMs !== null)) {
        out.played = true;
        out.order = [...entries].sort((a, b) => raceKey(a) - raceKey(b) || a.slot - b.slot).map((e) => e.groupId!);
        out.winner = out.order[0] ?? null;
      }
    } else if (full && entries.length === 2) {
      const [a, b] = entries;
      const ids = [a.groupId!, b.groupId!];
      const win = (w: string, note: string | null) => {
        out.played = true;
        out.winner = w;
        out.loser = ids.find((g) => g !== w) ?? null;
        out.order = [w, out.loser!];
        out.note = note;
      };
      if (a.forfeit && b.forfeit) {
        if (m.stage === "bracket") win(ids[0], "Both forfeit");
        else {
          out.played = true;
          out.note = "Both forfeit";
        }
      } else if (a.forfeit || b.forfeit) {
        const lost = a.forfeit ? ids[0] : ids[1];
        win(a.forfeit ? ids[1] : ids[0], `Walkover · ${name(lost)} forfeits`);
      } else if (m.walkover_to && ids.includes(m.walkover_to)) {
        win(m.walkover_to, "Walkover");
      } else if (a.score !== null && b.score !== null) {
        if (a.score !== b.score) win(a.score > b.score ? ids[0] : ids[1], null);
        else if (m.stage !== "bracket") {
          out.played = true;
          out.draw = true;
          out.note = "Draw";
        } else if (m.went_through && ids.includes(m.went_through)) win(m.went_through, `${name(m.went_through)} went through`);
      }
    }
    done.set(m.id, out);
    return out;
  };
  return [...sr.matches].sort((a, b) => a.position - b.position).map((m) => resolve(m, new Set()));
}

export const matchesLeft = (resolved: Resolved[]) => resolved.filter((r) => !r.played).length;

// ---------- standings ----------

export type StandingRow = {
  groupId: string; rank: number; tied: boolean;
  played: number; won: number; drawn: number; lost: number; diff: number; scored: number;
  timeMs: number | null; dnf: boolean; forfeit: boolean;
};
export type PoolTable = { pool: number; name: string; rows: StandingRow[] };

/** Standard competition ranking: 1 + how many are strictly better; `tied` when another is level. */
function rankRows<T>(rows: T[], better: (a: T, b: T) => number): (T & { rank: number; tied: boolean })[] {
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => better(o, r) < 0).length, tied: rows.some((o) => o !== r && better(o, r) === 0) }));
}

/** D659: each pool's table. Scores: wins, then difference, then scored. Times: the heat's order. Forfeits last. */
export function poolStandings(sr: SportResults, resolved: Resolved[]): PoolTable[] {
  const poolIds = [...new Set(sr.pools.map((p) => p.pool))].sort((a, b) => a - b);
  const time = sr.sport.result_kind === "time";
  return poolIds.map((pool) => {
    const members = sr.pools.filter((p) => p.pool === pool);
    const games = resolved.filter((r) => r.match.stage === "pool" && r.match.pool === pool);
    const rows = members.map((p) => {
      const row = { groupId: p.group_id, played: 0, won: 0, drawn: 0, lost: 0, diff: 0, scored: 0, timeMs: null as number | null, dnf: false, forfeit: p.forfeit };
      for (const g of games) {
        const me = g.entries.find((e) => e.groupId === p.group_id);
        if (!me || !g.played) continue;
        row.played += 1;
        if (time) {
          row.timeMs = me.timeMs;
          row.dnf = me.dnf;
          continue;
        }
        if (g.draw) row.drawn += 1;
        else if (g.winner === p.group_id) row.won += 1;
        else row.lost += 1;
        // Walkovers and forfeits carry no points (D658, D660): only a match decided on its score does.
        const other = g.entries.find((e) => e !== me);
        if ((g.note === null || g.draw) && me.score !== null && other && other.score !== null) {
          row.scored += me.score;
          row.diff += me.score - other.score;
        }
      }
      return row;
    });
    type Row = (typeof rows)[number];
    const better = time
      ? (a: Row, b: Row) => raceKey(a) - raceKey(b)
      : (a: Row, b: Row) => Number(a.forfeit) - Number(b.forfeit) || b.won - a.won || b.diff - a.diff || b.scored - a.scored;
    const order = new Map(members.map((m, i) => [m.group_id, i]));
    const ranked = rankRows(rows, better).sort((a, b) => a.rank - b.rank || (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0));
    return { pool, name: poolName(pool), rows: ranked };
  });
}

/** D673: one group's line in a time sport's table - each swim in race order, and its best. */
export type TimeRow = {
  groupId: string; rank: number; tied: boolean;
  swims: { timeMs: number | null; dnf: boolean }[];
  /** The fastest swim, or null with none timed yet. */
  bestMs: number | null;
  /** DNF in every swim it has. */
  dnf: boolean;
  forfeit: boolean;
};

/**
 * D673: a time sport's one table - every group playing it, ranked across all pools by its best
 * time; a DNF in every swim after every finisher, no time yet after that, a forfeit last. Equal
 * bests share a rank. Ranks are provisional until every race is in (`sportPlaces` waits for that).
 */
export function timeTable(sr: SportResults, resolved: Resolved[]): TimeRow[] {
  const races = resolved.filter((r) => r.match.stage !== "manual");
  const rows = sr.pools.map((p) => {
    const swims = races.flatMap((r) => r.entries.filter((e) => e.groupId === p.group_id).map((e) => ({ timeMs: e.timeMs, dnf: e.dnf })));
    const times = swims.flatMap((s) => (s.timeMs !== null ? [s.timeMs] : []));
    const bestMs = times.length ? Math.min(...times) : null;
    return { groupId: p.group_id, swims, bestMs, dnf: bestMs === null && swims.some((s) => s.dnf), forfeit: p.forfeit };
  });
  type Row = (typeof rows)[number];
  const key = (r: Row) => raceKey({ forfeit: r.forfeit, dnf: r.dnf, timeMs: r.bestMs });
  const order = new Map(sr.pools.map((p, i) => [p.group_id, i]));
  return rankRows(rows, (a: Row, b: Row) => key(a) - key(b))
    .sort((a, b) => a.rank - b.rank || (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0));
}

/** D657: each group's pool place for the semi pickers, "A1", or "A1=" when level. */
export function poolPlaces(tables: PoolTable[]): Map<string, string> {
  return new Map(tables.flatMap((t) => t.rows.map((r) => [r.groupId, `${t.name.slice(-1)}${r.rank}${r.tied ? "=" : ""}`] as const)));
}

// ---------- places, points, overall ----------

export type Place = { place: number; groupId: string; forfeit: boolean };

/**
 * D661: a sport's settled places. Brackets: final winner and loser, then the 3rd-place match,
 * each bracket from its first place on. Times (D673): once every race is in, the time table's
 * ranks, equal bests sharing a place. By hand (D665): the admin's numbers.
 */
export function sportPlaces(sr: SportResults, resolved: Resolved[]): Place[] {
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  const places: Place[] = [];
  const put = (place: number, groupId: string | null) => {
    if (groupId) places.push({ place, groupId, forfeit: forfeit.has(groupId) });
  };
  if (sr.sport.format === "manual") {
    for (const p of sr.pools) if (p.manual_place !== null) put(p.manual_place, p.group_id);
    return places.sort((a, b) => a.place - b.place || a.groupId.localeCompare(b.groupId));
  }
  if (sr.sport.result_kind === "time") {
    if (resolved.length === 0 || resolved.some((r) => !r.played)) return [];
    for (const row of timeTable(sr, resolved)) put(row.rank, row.groupId);
    return places;
  }
  const teams = new Set(sr.pools.map((p) => p.pool)).size;
  for (const r of resolved) {
    if (r.match.stage !== "bracket" || !r.played) continue;
    const base = (r.match.bracket ?? 0) * teams;
    if (r.match.round === "final") {
      put(base + 1, r.winner);
      put(base + 2, r.loser);
    } else if (r.match.round === "third") {
      put(base + 3, r.winner);
      put(base + 4, r.loser);
    }
  }
  return places.sort((a, b) => a.place - b.place);
}

/** D654/D660: a place's points; a forfeit, a place past the table or no table at all is 0. */
export function pointsFor(place: Place, table: number[] | null | undefined): number {
  if (place.forfeit || !table) return 0;
  return table[place.place - 1] ?? 0;
}

/** `bonus`: D674's points for this group (0 when not earned) plus D705's ad hoc points; null when the tournament has neither. */
export type OverallRow = { groupId: string; rank: number; tied: boolean; total: number; bySport: (number | "F" | null)[]; bonus: number | null };

/** D674: the full participation bonus (0 for none) and the groups earning it now; D705: each group's net ad hoc points. */
export type CupBonus = { points: number; earned: Set<string>; extra?: Map<string, number> };

/**
 * D662: each group's points across sports (null: no place yet; "F": a forfeit, worth 0), plus
 * D674's bonus, ranked by total. D711: equal totals share the place (no count-back on 1st places).
 */
export function overallTable(input: {
  sports: TournamentSport[];
  places: Map<string, Place[]>;
  groupIds: string[];
  table: number[];
  /** Per sport, the groups marked forfeit: "F" even before they have a place (D660: they score 0 whatever happens). */
  forfeits?: Map<string, Set<string>>;
  bonus?: CupBonus | null;
}): OverallRow[] {
  const sports = [...input.sports].sort((a, b) => a.position - b.position);
  const rows = input.groupIds.map((groupId) => {
    const bySport = sports.map((s): number | "F" | null => {
      const p = (input.places.get(s.id) ?? []).find((x) => x.groupId === groupId);
      if (!p) return input.forfeits?.get(s.id)?.has(groupId) ? "F" : null;
      if (p.forfeit) return "F";
      return pointsFor(p, input.table);
    });
    const bonus = input.bonus ? (input.bonus.earned.has(groupId) ? input.bonus.points : 0) + (input.bonus.extra?.get(groupId) ?? 0) : null;
    const total = bySport.reduce<number>((n, v) => n + (typeof v === "number" ? v : 0), bonus ?? 0);
    return { groupId, total, bySport, bonus };
  });
  const order = new Map(input.groupIds.map((g, i) => [g, i]));
  return rankRows(rows, (a, b) => b.total - a.total)
    .sort((a, b) => a.rank - b.rank || (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0));
}

/**
 * D712: the podium, left to right - one step per group in the top three places, the best in the
 * middle and the rest alternating left and right (2nd, 1st, 3rd). Two groups level on top get a
 * gold step each; a place a tie skips (no 2nd after two 1sts) has no step.
 */
export function podium(rows: OverallRow[]): OverallRow[] {
  const top = rows.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank);
  return top.reduce<OverallRow[]>((out, r, i) => (i % 2 ? [r, ...out] : [...out, r]), []);
}

// ---------- guarding a change ----------

/**
 * D658: the label of the first match that already has a result and whose teams `after` would
 * change - a semi corrected after the final it feeds was played - or null if nothing would move.
 */
export function blockedBy(before: SportResults, after: SportResults, names: Map<string, string>): string | null {
  const now = new Map(resolveSport(after, names).map((r) => [r.match.id, r]));
  for (const r of resolveSport(before, names)) {
    if (!hasResult(r.match, before.slots)) continue;
    const next = now.get(r.match.id);
    const was = r.entries.map((e) => e.groupId).join("|");
    if (next && next.entries.map((e) => e.groupId).join("|") !== was) return r.label;
  }
  return null;
}

// ---------- organiser input ----------

type SlotResult = Pick<Slot, "slot" | "score" | "time_ms" | "dnf">;
export type ResultRead = { ok: true; slots: SlotResult[]; went_through: string | null } | { ok: false; error: string };

/**
 * D658: a match's result form, read. Scores: both whole numbers 0-999, and a level bracket match
 * names who went through. Times: `m:ss.hh` or DNF per squad, a blank left empty (a race can be
 * typed in as the squads finish).
 */
export function readResult(r: Resolved, kind: ResultKind, read: (key: string) => string): ResultRead {
  const slots = r.entries.map((e) => e.slot);
  if (kind === "time") {
    const out: SlotResult[] = [];
    for (const slot of slots) {
      const text = read(`time:${slot}`).trim();
      if (!text) {
        out.push({ slot, score: null, time_ms: null, dnf: false });
        continue;
      }
      const t = parseTime(text);
      if (t === null) return { ok: false, error: "Times look like 1:52.30, or DNF." };
      out.push({ slot, score: null, time_ms: t === "dnf" ? null : t, dnf: t === "dnf" });
    }
    if (out.every((s) => s.time_ms === null && !s.dnf)) return { ok: false, error: "Type at least one time." };
    return { ok: true, slots: out, went_through: null };
  }
  const scores = slots.map((slot) => read(`score:${slot}`).trim());
  if (!scores.every((s) => /^\d{1,3}$/.test(s))) return { ok: false, error: `Scores must be whole numbers from 0 to ${MAX_SCORE}.` };
  const n = scores.map(Number);
  let went_through: string | null = null;
  if (r.match.stage === "bracket" && n.length === 2 && n[0] === n[1]) {
    const pick = read("went_through");
    if (!r.entries.some((e) => e.groupId && e.groupId === pick)) return { ok: false, error: "Pick who went through." };
    went_through = pick;
  }
  return { ok: true, slots: slots.map((slot, i) => ({ slot, score: n[i], time_ms: null, dnf: false })), went_through };
}

/** A copy of the sport with one match changed: its results, walkover / went-through, or who plays. */
export function withChange(sr: SportResults, matchId: string, change: {
  slots?: SlotResult[];
  walkover_to?: string | null;
  went_through?: string | null;
  groups?: { slot: number; group_id: string | null }[];
}): SportResults {
  return {
    ...sr,
    matches: sr.matches.map((m) => (m.id !== matchId ? m : {
      ...m,
      ...(change.walkover_to !== undefined && { walkover_to: change.walkover_to }),
      ...(change.went_through !== undefined && { went_through: change.went_through }),
    })),
    slots: sr.slots.map((s) => {
      if (s.match_id !== matchId) return s;
      const res = change.slots?.find((x) => x.slot === s.slot);
      const grp = change.groups?.find((x) => x.slot === s.slot);
      return { ...s, ...(res && { score: res.score, time_ms: res.time_ms, dnf: res.dnf }), ...(grp && !s.source_match_id && { group_id: grp.group_id }) };
    }),
  };
}

export type PickerOption = { id: string; label: string; usedIn: string | null };

/**
 * D657: who can be picked into a bracket match - every group playing the sport, those at the
 * bracket's pool place first (Silver: the 2nds), each with its place ("Team 4 · A1"), and where
 * it is already picked in another bracket match of this sport.
 */
export function pickerOptions(sr: SportResults, resolved: Resolved[], tables: PoolTable[], names: Map<string, string>, matchId: string): PickerOption[] {
  const match = sr.matches.find((m) => m.id === matchId);
  const want = (match?.bracket ?? 0) + 1;
  const place = poolPlaces(tables);
  const rank = new Map(tables.flatMap((t) => t.rows.map((r) => [r.groupId, { rank: r.rank, pool: t.pool }] as const)));
  const used = new Map<string, string>();
  for (const r of resolved) {
    if (r.match.stage !== "bracket" || r.match.id === matchId) continue;
    for (const s of sr.slots) if (s.match_id === r.match.id && !s.source_match_id && s.group_id) used.set(s.group_id, r.label);
  }
  const order = new Map(sr.pools.map((p, i) => [p.group_id, i]));
  return [...sr.pools]
    .sort((a, b) => {
      const ra = rank.get(a.group_id);
      const rb = rank.get(b.group_id);
      return Number(ra?.rank !== want) - Number(rb?.rank !== want) || (ra?.pool ?? 0) - (rb?.pool ?? 0) || (ra?.rank ?? 0) - (rb?.rank ?? 0) || (order.get(a.group_id) ?? 0) - (order.get(b.group_id) ?? 0);
    })
    .map((p) => ({
      id: p.group_id,
      label: `${names.get(p.group_id) ?? "A group"}${place.get(p.group_id) ? ` · ${place.get(p.group_id)}` : ""}`,
      usedIn: used.get(p.group_id) ?? null,
    }));
}

/** D662: the overall table straight from every sport's results - the groups that play some sport, in `groups` order - with D674's bonus. */
export function tournamentOverall(results: SportResults[], groups: { id: string; name: string }[], table: number[], bonus: CupBonus | null = null): OverallRow[] {
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const playing = new Set(results.flatMap((r) => r.pools.map((p) => p.group_id)));
  const places = new Map(results.map((r) => [r.sport.id, sportPlaces(r, resolveSport(r, names))]));
  const forfeits = new Map(results.map((r) => [r.sport.id, new Set(r.pools.filter((p) => p.forfeit).map((p) => p.group_id))]));
  return overallTable({ sports: results.map((r) => r.sport), places, groupIds: groups.map((g) => g.id).filter((g) => playing.has(g)), table, forfeits, bonus });
}

/** D660: a copy of the sport with one group's forfeit flag changed, for `blockedBy`. */
export function withForfeit(sr: SportResults, groupId: string, forfeit: boolean): SportResults {
  return { ...sr, pools: sr.pools.map((p) => (p.group_id === groupId ? { ...p, forfeit } : p)) };
}

export type TournamentTab = "about" | "squads" | "results" | "leaderboard";
const TABS: TournamentTab[] = ["about", "squads", "results", "leaderboard"];

/**
 * D663: the portal tab to show. The one asked for, if the page has it (About needs a description,
 * Leaderboard a points table the organiser isn't hiding); otherwise Squads before the deadline
 * (squads are still the job), and the Leaderboard - or Results without one - from then on.
 */
export function tournamentTab(input: { tab: string | null; locked: boolean; leaderboard: boolean; about: boolean }): TournamentTab {
  const has = (t: TournamentTab) => (t === "about" ? input.about : t === "leaderboard" ? input.leaderboard : true);
  const asked = TABS.find((t) => t === input.tab);
  if (asked && has(asked)) return asked;
  if (asked === "leaderboard") return "results";
  if (!input.locked) return "squads";
  return input.leaderboard ? "leaderboard" : "results";
}

/** The sport Results shows: the link's, else the one this phone last picked, else the first. */
export function pickSport(asked: string | null, remembered: string | null, sportIds: string[]): string | null {
  if (asked && sportIds.includes(asked)) return asked;
  if (remembered && sportIds.includes(remembered)) return remembered;
  return sportIds[0] ?? null;
}
