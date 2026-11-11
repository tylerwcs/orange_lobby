import type { Place, SportResults } from "./results";
import type { SquadRow } from "./squads";

/**
 * D860-D867: a lane-draw sport (bowling). Every playing side's bowlers get a seat on a lane for
 * each game; an admin keys each seat's score; a side's total is all its seats added up. Pure, so
 * the admin tab, the portal and the export all count the same.
 */

/** One bowler's seat in one game, as stored (0133). `group_id` is the side (D825). */
export type LaneSeat = {
  sport_id: string; game: number; lane: number; seat: number; group_id: string; attendee_id: string;
  /** The side's random 1..n label, A1..A4 in the user's picture. */
  number: number;
  score: number | null;
};

export type DrawnSeat = Omit<LaneSeat, "sport_id" | "score">;

/** How many arrangements each game tries before keeping the best (D862 rule 3). */
const TRIES = 400;

function shuffled<T>(list: T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * D862: seats every side's bowlers for every game. Lanes fill evenly (sizes differ by at most
 * one); no lane holds two of one side when the numbers allow it; each game keeps, of `TRIES`
 * arrangements, the one repeating the fewest lane-mate pairs from earlier games. Each side's
 * bowlers are numbered 1..n at random once, the same in every game.
 */
export function drawLanes(sides: { id: string; bowlers: string[] }[], lanes: number, games: number, random: () => number = Math.random): DrawnSeat[] {
  const bowlers = sides.flatMap((s) => shuffled(s.bowlers, random).map((id, i) => ({ id, side: s.id, number: i + 1 })));
  if (bowlers.length === 0 || lanes < 1) return [];
  const met = new Map<string, number>();
  const out: DrawnSeat[] = [];
  const base = Math.floor(bowlers.length / lanes);
  const extra = bowlers.length % lanes;

  for (let game = 1; game <= games; game++) {
    let best: (typeof bowlers)[] | null = null;
    let bestCost = Infinity;
    for (let t = 0; t < TRIES && bestCost > 0; t++) {
      const caps = shuffled(Array.from({ length: lanes }, (_, i) => base + (i < extra ? 1 : 0)), random);
      const laneOf: (typeof bowlers)[] = Array.from({ length: lanes }, () => []);
      let cost = 0;
      for (const b of shuffled(bowlers, random)) {
        const open = laneOf.map((l, i) => i).filter((i) => laneOf[i].length < caps[i]);
        const clean = open.filter((i) => !laneOf[i].some((x) => x.side === b.side));
        const pool = clean.length ? clean : open;
        if (!clean.length) cost += 1000;
        const repeats = (i: number) => laneOf[i].reduce((n, x) => n + (met.get(pair(x.id, b.id)) ?? 0), 0);
        const least = Math.min(...pool.map(repeats));
        const picks = pool.filter((i) => repeats(i) === least);
        const lane = picks[Math.floor(random() * picks.length)];
        cost += least;
        laneOf[lane].push(b);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = laneOf;
      }
    }
    best!.forEach((lane, i) => {
      lane.forEach((b, j) => {
        out.push({ game, lane: i + 1, seat: j + 1, group_id: b.side, attendee_id: b.id, number: b.number });
        for (const x of lane.slice(0, j)) met.set(pair(x.id, b.id), (met.get(pair(x.id, b.id)) ?? 0) + 1);
      });
    });
  }
  return out;
}

/** D866: each side's total so far, with how many of its seats are keyed, in `sideIds` order. */
export function laneTotals(seats: LaneSeat[], sideIds: string[]): { groupId: string; total: number; keyed: number; seats: number }[] {
  return sideIds.map((groupId) => {
    const mine = seats.filter((s) => s.group_id === groupId);
    const keyed = mine.filter((s) => s.score !== null);
    return { groupId, total: keyed.reduce((n, s) => n + (s.score ?? 0), 0), keyed: keyed.length, seats: mine.length };
  });
}

const seatsOf = (sr: SportResults) => sr.seats ?? [];

/** The sides in the draw: its pool rows (who plays), then any side that only has seats. */
function drawnSides(sr: SportResults): string[] {
  return [...new Set([...sr.pools.map((p) => p.group_id), ...seatsOf(sr).map((s) => s.group_id)])];
}

/** D866, D861a: drawn, and every seat of every side not marked forfeit has a score. */
export function laneComplete(sr: SportResults): boolean {
  const seats = seatsOf(sr);
  if (seats.length === 0) return false;
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  return seats.every((s) => forfeit.has(s.group_id) || s.score !== null);
}

/**
 * D866: once complete, sides by total, highest first; equal totals share the place (D711).
 * D861a: a forfeit side comes after every other, whatever it scored.
 */
export function lanePlaces(sr: SportResults): Place[] {
  if (!laneComplete(sr)) return [];
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  const sides = drawnSides(sr);
  const playing = laneTotals(seatsOf(sr), sides.filter((g) => !forfeit.has(g)));
  const out: Place[] = playing.map((t) => ({ place: 1 + playing.filter((o) => o.total > t.total).length, groupId: t.groupId, forfeit: false }));
  const last = playing.length + 1;
  for (const g of sides.filter((x) => forfeit.has(x))) out.push({ place: last, groupId: g, forfeit: true });
  return out.sort((a, b) => a.place - b.place || a.groupId.localeCompare(b.groupId));
}

/** The games of a draw, each with its lanes and their seats, in order. */
export function gamesOf(seats: LaneSeat[]): { game: number; lanes: { lane: number; seats: LaneSeat[] }[] }[] {
  const games = [...new Set(seats.map((s) => s.game))].sort((a, b) => a - b);
  return games.map((game) => {
    const mine = seats.filter((s) => s.game === game);
    const lanes = [...new Set(mine.map((s) => s.lane))].sort((a, b) => a - b);
    return { game, lanes: lanes.map((lane) => ({ lane, seats: mine.filter((s) => s.lane === lane).sort((a, b) => a.seat - b.seat) })) };
  });
}

/** D867: attendees see lane scores, totals and places unless the reveal switch (D662) is off. */
export function laneScoresVisible(activity: { show_overall?: boolean | null }): boolean {
  return activity.show_overall !== false;
}

/**
 * D864: the squad side of a swap. The old bowler leaves the squad if they're in it; the new one
 * joins unless an admin already put them in (on the Squads tab, say).
 */
export function swapSquadSteps(input: { outInSquad: boolean; inInSquad: boolean }): { removeOut: boolean; addIn: boolean } {
  return { removeOut: input.outInSquad, addIn: !input.inInSquad };
}

/**
 * D865: one game's scores from the admin's form, one box per bowler (`score:<attendee id>`). A blank
 * box changes nothing, so two admins keying the same game don't wipe each other's scores; a no-show
 * is keyed as 0. Boxes for anyone not seated in this game are ignored.
 */
export function readLaneGame(seats: LaneSeat[], game: number, read: (key: string) => string):
  { ok: true; scores: { attendee_id: string; score: number }[] } | { ok: false; error: string } {
  const scores: { attendee_id: string; score: number }[] = [];
  for (const s of seats.filter((x) => x.game === game)) {
    const text = read(`score:${s.attendee_id}`).trim();
    if (text === "") continue;
    if (!/^\d{1,3}$/.test(text) || Number(text) > 300) return { ok: false, error: "Scores are whole numbers from 0 to 300." };
    scores.push({ attendee_id: s.attendee_id, score: Number(text) });
  }
  return { ok: true, scores };
}

/**
 * D864 (amended 11 Nov): a swap on the Squads tab also moves the lane seats of a drawn lane sport,
 * when the old bowler is seated and the new one isn't - so the draw shows who actually bowls.
 */
export function seatFollowsSwap(sport: { format: string }, seats: LaneSeat[], outId: string, inId: string): boolean {
  return sport.format === "lanes" && seats.some((s) => s.attendee_id === outId) && !seats.some((s) => s.attendee_id === inId);
}

/** Seated bowlers with no counted place in this sport's squad any more (removed, cancelled or moved), once each in seat order. */
export function staleBowlers(seats: LaneSeat[], counted: SquadRow[], sportId: string): string[] {
  const inSquad = new Set(counted.filter((r) => r.sport_id === sportId).map((r) => r.attendee_id));
  return [...new Set(seats.map((s) => s.attendee_id))].filter((id) => !inSquad.has(id));
}

/** D864: whether this person can take a seat - not already bowling in the sport. */
export function canSwapIn(seats: LaneSeat[], sportId: string, inId: string): boolean {
  return !seats.some((s) => s.sport_id === sportId && s.attendee_id === inId);
}
