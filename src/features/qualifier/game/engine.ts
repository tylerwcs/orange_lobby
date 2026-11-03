// The slime game (D790) as a pure, deterministic state machine. The phone plays it and the
// server replays the player's keystrokes through it from the same seed, so the two must agree
// to the millisecond: integer ms and mm only, randomness only from the seeded mulberry32.
import { WORDS } from "../words";
import { mulberry32, randInt } from "./rng";
import { bossSentence } from "./sentences";
import {
  BOSS_AT_MS, BOSS_BONUS, BOSS_DIST_MM, BOSS_HIT, BOSS_SPEED_MM_S, FINAL_BOSS_DIST_MM, GAP_JITTER_MS, GAP_MS, MAX_SMALL,
  POINTS_PER_LETTER, RUN_CAP_MS, SMALL_HIT, SPAWN_DIST_MM, STICK_MS, TICK_MS, TIME_BONUS_PER_S, lengthBand,
  multiplier, speedAt,
} from "./rules";

export type Slime = {
  id: number;
  kind: "small" | "boss";
  /** One word for a small slime; a boss's sentence, word by word. */
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
  type: "spawn" | "letter" | "wrong" | "word" | "pop" | "stick" | "explode" | "boss" | "end";
  id?: number;
  /** "explode": the points it took (less than the hit when the score was lower). "end": the time bonus. */
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
  /** The last boss was popped: the run ended early, with `timeBonus` for the time left. */
  cleared: boolean;
  timeBonus: number;
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
  /** Bosses spawned so far: the number of the one out, if any. */
  bossCount: number;
  nextId: number;
};

export const currentWord = (s: Slime): string => s.words[s.wordIndex];

export function newGame(seed: number): Game {
  return {
    seed, nowMs: 0, score: 0, combo: 0, popped: 0, bosses: 0, cleared: false, timeBonus: 0, slimes: [], lock: null,
    ended: false, endedMs: null, events: [],
    rand: mulberry32(seed), nextTickMs: 0, nextSpawnMs: 0, bossDueMs: BOSS_AT_MS[0], bossCount: 0, nextId: 1,
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
      const speed = s.kind === "boss" ? BOSS_SPEED_MM_S : speedAt(s.spawnedMs);
      s.distMm -= Math.floor((speed * TICK_MS) / 1000);
      if (s.distMm <= 0) {
        s.distMm = 0;
        s.stuckLeftMs = STICK_MS;
        g.events.push({ t: now, type: "stick", id: s.id });
      }
    }
    i++;
  }
  const bossOut = g.slimes.some((s) => s.kind === "boss");
  if (!bossOut && g.bossDueMs !== null && now >= g.bossDueMs) return spawnBoss(g);
  // The last boss is the run's last slime.
  if (bossOut || g.bossCount >= BOSS_AT_MS.length || now < g.nextSpawnMs) return;
  if (g.slimes.filter((s) => s.kind === "small").length >= MAX_SMALL) return;
  spawnSmall(g);
}

function spawnSmall(g: Game): void {
  const now = g.nowMs;
  const [min, max] = lengthBand(now);
  const band = WORDS.filter((w) => w.length >= min && w.length <= max);
  const taken = new Set(g.slimes.map((s) => currentWord(s)[0]));
  const free = band.filter((w) => !taken.has(w[0]));
  const pool = free.length > 0 ? free : band;
  const s = addSlime(g, "small", [pool[randInt(g.rand, pool.length)]], SPAWN_DIST_MM);
  g.nextSpawnMs = now + GAP_MS + randInt(g.rand, GAP_JITTER_MS);
  g.events.push({ t: now, type: "spawn", id: s.id });
}

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
  g.events.push({ t: tMs, type: "letter", id: s.id });
  const word = currentWord(s);
  if (s.typed < word.length) return;
  g.combo += 1;
  g.score += word.length * POINTS_PER_LETTER * multiplier(g.combo);
  // A boss keeps the lock between its words, so its next word continues (Ruling 18); one
  // backspace with nothing typed releases it. A popped slime's lock goes with it (remove).
  if (s.kind === "boss" && s.wordIndex < s.words.length - 1) {
    s.wordIndex += 1;
    s.typed = 0;
    g.events.push({ t: tMs, type: "word", id: s.id });
    return;
  }
  if (s.kind === "boss") {
    g.bosses += 1;
    g.score += BOSS_BONUS * g.bossCount;
  } else g.popped += 1;
  remove(g, s);
  g.events.push({ t: tMs, type: "pop", id: s.id });
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
