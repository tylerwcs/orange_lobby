// The slime game (D790) as a pure, deterministic state machine. The phone plays it and the
// server replays the player's keystrokes through it from the same seed, so the two must agree
// to the millisecond: integer ms and mm only, randomness only from the seeded mulberry32.
import { PHRASES, WORDS } from "../words";
import { mulberry32, randInt } from "./rng";
import { bossSentence } from "./sentences";
import {
  BOSS_AT_MS, BOSS_BONUS, BOSS_DIST_MM, BOSS_HIT, BOSS_SPEED_MM_S, FINAL_BOSS_DIST_MM, GAP_JITTER_MS, GAP_MS, MAX_SMALL,
  POINTS_PER_LETTER, RUN_CAP_MS, SMALL_HIT, SPAWN_DIST_MM, STAR_BONUS, STAR_SPEED_MM_S, STAR_WORDS, STICK_MS, TICK_MS,
  TIME_BONUS_PER_S, TWO_WORD_FROM_MS, TWO_WORD_ONE_IN, lengthBand,
  multiplier, speedAt, starAt,
} from "./rules";

export type Slime = {
  id: number;
  /** "star": the run's one bonus star (D819). */
  kind: "small" | "boss" | "star";
  /** One word for a small slime (two, a phrase, late in the run); a boss's sentence, word by word. */
  words: string[];
  wordIndex: number;
  /** Correct letters typed of the current word. */
  typed: number;
  distMm: number;
  /** -30..30, degrees off straight ahead. Render only. */
  lane: number;
  /** Set once the slime reached the player: ms until it explodes. */
  stuckLeftMs: number | null;
  spawnedMs: number;
  /** 0..3. Render only. */
  look: number;
};

export type GameEvent = {
  t: number;
  /** "star": the bonus star came out; "escape": it reached the player untyped and got away (D819). */
  type: "spawn" | "letter" | "wrong" | "word" | "pop" | "stick" | "explode" | "boss" | "star" | "escape" | "end";
  id?: number;
  /**
   * "word"/"pop": the points it scored (a boss's or the star's pop includes its bonus). "explode": the points it
   * took (less than the hit when the score was lower). "end": the time bonus. Render only.
   */
  points?: number;
};

export type Game = {
  seed: number;
  /** Time of the last tick run. */
  nowMs: number;
  score: number;
  combo: number;
  /** Small slimes popped. */
  popped: number;
  /** Bosses popped. */
  bosses: number;
  /** Bonus stars caught (0 or 1, D819). */
  stars: number;
  /** The last boss was popped: the run ended early, with `timeBonus` for the time left. */
  cleared: boolean;
  timeBonus: number;
  /** For the results screen (D816): the longest combo, letters typed right, and wrong keys. */
  bestCombo: number;
  letters: number;
  misses: number;
  slimes: Slime[];
  /** Id of the slime being typed. */
  lock: number | null;
  ended: boolean;
  endedMs: number | null;
  /** Append-only log for the renderer to drain; the engine never reads it. */
  events: GameEvent[];
  // Engine-private.
  rand: () => number;
  nextTickMs: number;
  nextSpawnMs: number;
  /** When the next boss is due; null once the last is out. */
  bossDueMs: number | null;
  /** When the star comes out; null once it has. */
  starDueMs: number | null;
  /** Bosses spawned so far: the number of the one out, if any. */
  bossCount: number;
  nextId: number;
};

export const currentWord = (s: Slime): string => s.words[s.wordIndex];

export function newGame(seed: number): Game {
  return {
    seed, nowMs: 0, score: 0, combo: 0, popped: 0, bosses: 0, stars: 0, cleared: false, timeBonus: 0, bestCombo: 0, letters: 0, misses: 0, slimes: [], lock: null,
    ended: false, endedMs: null, events: [],
    rand: mulberry32(seed), nextTickMs: 0, nextSpawnMs: 0, bossDueMs: BOSS_AT_MS[0], starDueMs: starAt(seed), bossCount: 0, nextId: 1,
  };
}

/**
 * Run every whole tick due by `tMs` (ticks fall at 0, TICK_MS, 2·TICK_MS, …). Reaching
 * RUN_CAP_MS ends the run there: every run lasts that long unless the last boss goes first. No-op
 * once ended.
 */
export function advance(g: Game, tMs: number): void {
  while (!g.ended && g.nextTickMs <= tMs) {
    g.nowMs = g.nextTickMs;
    g.nextTickMs += TICK_MS;
    if (g.nowMs >= RUN_CAP_MS) return end(g);
    tick(g);
  }
}

/** Advance to `tMs`, then apply one key: a–z (any case) or "\b". Anything else is ignored. */
export function press(g: Game, key: string, tMs: number): void {
  advance(g, tMs);
  if (g.ended) return;
  if (key === "\b") return backspace(g);
  const c = key.toLowerCase();
  if (c.length !== 1 || c < "a" || c > "z") return;
  const locked = g.slimes.find((s) => s.id === g.lock);
  if (locked) {
    if (currentWord(locked)[locked.typed] === c) letter(g, locked, tMs);
    else wrong(g, tMs);
    return;
  }
  let target: Slime | undefined;
  for (const s of g.slimes) {
    if (currentWord(s)[0] !== c) continue;
    if (!target || s.distMm < target.distMm || (s.distMm === target.distMm && s.id < target.id)) target = s;
  }
  if (!target) return wrong(g, tMs);
  g.lock = target.id;
  letter(g, target, tMs);
}

/** Let the run play out with no more input, until it ends at RUN_CAP_MS. */
export function finish(g: Game): void {
  advance(g, RUN_CAP_MS);
}

function tick(g: Game): void {
  const now = g.nowMs;
  for (let i = 0; i < g.slimes.length; ) {
    const s = g.slimes[i];
    if (s.stuckLeftMs !== null) {
      s.stuckLeftMs -= TICK_MS;
      if (s.stuckLeftMs <= 0) {
        explode(g, s, i);
        continue;
      }
    } else {
      s.distMm -= Math.floor((speedOf(s) * TICK_MS) / 1000);
      if (s.distMm <= 0 && s.kind === "star") {
        // The star doesn't bite: it gets away, and that's all.
        remove(g, s, i);
        g.events.push({ t: now, type: "escape", id: s.id });
        continue;
      }
      if (s.distMm <= 0) {
        s.distMm = 0;
        s.stuckLeftMs = STICK_MS;
        g.events.push({ t: now, type: "stick", id: s.id });
      }
    }
    i++;
  }
  // The star comes out at its moment, whatever else is out (it is always before the first boss).
  if (g.starDueMs !== null && now >= g.starDueMs) spawnStar(g);
  const bossOut = g.slimes.some((s) => s.kind === "boss");
  if (!bossOut && g.bossDueMs !== null && now >= g.bossDueMs) return spawnBoss(g);
  // The last boss is the run's last slime.
  if (bossOut || g.bossCount >= BOSS_AT_MS.length || now < g.nextSpawnMs) return;
  if (g.slimes.filter((s) => s.kind === "small").length >= MAX_SMALL) return;
  spawnSmall(g);
}

function spawnSmall(g: Game): void {
  const now = g.nowMs;
  const taken = new Set(g.slimes.map((s) => currentWord(s)[0]));
  let words: string[];
  if (now >= TWO_WORD_FROM_MS && randInt(g.rand, TWO_WORD_ONE_IN) === 0) {
    const free = PHRASES.filter((p) => !taken.has(p[0][0]));
    const pool = free.length > 0 ? free : PHRASES;
    words = [...pool[randInt(g.rand, pool.length)]];
  } else {
    const [min, max] = lengthBand(now);
    const band = WORDS.filter((w) => w.length >= min && w.length <= max);
    const free = band.filter((w) => !taken.has(w[0]));
    const pool = free.length > 0 ? free : band;
    words = [pool[randInt(g.rand, pool.length)]];
  }
  const s = addSlime(g, "small", words, SPAWN_DIST_MM);
  g.nextSpawnMs = now + GAP_MS + randInt(g.rand, GAP_JITTER_MS);
  g.events.push({ t: now, type: "spawn", id: s.id });
}

function spawnStar(g: Game): void {
  g.starDueMs = null;
  const s = addSlime(g, "star", [...STAR_WORDS], SPAWN_DIST_MM);
  g.events.push({ t: g.nowMs, type: "star", id: s.id });
}

/** How fast slime `s` comes, mm/s: a small one at its spawn time's speed. */
export const speedOf = (s: Slime): number =>
  s.kind === "boss" ? BOSS_SPEED_MM_S : s.kind === "star" ? STAR_SPEED_MM_S : speedAt(s.spawnedMs);

function spawnBoss(g: Game): void {
  g.bossCount += 1;
  g.bossDueMs = BOSS_AT_MS[g.bossCount] ?? null;
  const last = g.bossDueMs === null;
  const s = addSlime(g, "boss", bossSentence(g.rand, g.bossCount), last ? FINAL_BOSS_DIST_MM : BOSS_DIST_MM);
  g.events.push({ t: g.nowMs, type: "boss", id: s.id });
}

function addSlime(g: Game, kind: Slime["kind"], words: string[], distMm: number): Slime {
  const s: Slime = {
    id: g.nextId++, kind, words, wordIndex: 0, typed: 0, distMm,
    lane: randInt(g.rand, 61) - 30, stuckLeftMs: null, spawnedMs: g.nowMs, look: randInt(g.rand, 4),
  };
  g.slimes.push(s);
  return s;
}

/** Take slime `s` (at index `i`) out of play. */
function remove(g: Game, s: Slime, i = g.slimes.indexOf(s)): void {
  g.slimes.splice(i, 1);
  if (g.lock === s.id) g.lock = null;
}

/** A slime bit for STICK_MS and burst (D812): it costs points, never below 0, and the combo. */
function explode(g: Game, s: Slime, i: number): void {
  remove(g, s, i);
  const points = Math.min(g.score, s.kind === "boss" ? BOSS_HIT : SMALL_HIT);
  g.score -= points;
  g.combo = 0;
  g.events.push({ t: g.nowMs, type: "explode", id: s.id, points });
}

/** The run is over: at RUN_CAP_MS, or the last boss popped, `bonus` being its time bonus. */
function end(g: Game, bonus = 0): void {
  g.ended = true;
  g.endedMs = g.nowMs;
  g.events.push({ t: g.nowMs, type: "end", points: bonus });
}

function letter(g: Game, s: Slime, tMs: number): void {
  s.typed += 1;
  g.letters += 1;
  g.events.push({ t: tMs, type: "letter", id: s.id });
  const word = currentWord(s);
  if (s.typed < word.length) return;
  g.combo += 1;
  g.bestCombo = Math.max(g.bestCombo, g.combo);
  let points = word.length * POINTS_PER_LETTER * multiplier(g.combo);
  g.score += points;
  // A boss, the star or a two-word slime keeps the lock between its words, so its next word continues
  // (Ruling 18); one backspace with nothing typed releases it. A popped slime's lock goes with it.
  if (s.wordIndex < s.words.length - 1) {
    s.wordIndex += 1;
    s.typed = 0;
    g.events.push({ t: tMs, type: "word", id: s.id, points });
    return;
  }
  if (s.kind === "boss") {
    g.bosses += 1;
    g.score += BOSS_BONUS * g.bossCount;
    points += BOSS_BONUS * g.bossCount;
  } else if (s.kind === "star") {
    g.stars += 1;
    g.score += STAR_BONUS;
    points += STAR_BONUS;
  } else g.popped += 1;
  remove(g, s);
  g.events.push({ t: tMs, type: "pop", id: s.id, points });
  // The last boss popped: the run is won, and every whole second left counts.
  if (s.kind === "boss" && g.bossDueMs === null) {
    const bonus = Math.floor((RUN_CAP_MS - g.nowMs) / 1000) * TIME_BONUS_PER_S;
    g.score += bonus;
    g.cleared = true;
    g.timeBonus = bonus;
    end(g, bonus);
  }
}

function wrong(g: Game, tMs: number): void {
  g.combo = 0;
  g.misses += 1;
  g.events.push({ t: tMs, type: "wrong" });
}

function backspace(g: Game): void {
  const s = g.slimes.find((x) => x.id === g.lock);
  if (!s) return;
  s.typed -= 1;
  if (s.typed <= 0) {
    s.typed = 0;
    g.lock = null;
  }
}
