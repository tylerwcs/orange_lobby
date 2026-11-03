import { describe, expect, it } from "vitest";
import { newGame, advance, press, finish, currentWord, type Game } from "@/features/qualifier/game/engine";
import {
  BOSS_AT_MS, BOSS_BONUS, BOSS_DIST_MM, BOSS_HIT, FINAL_BOSS_DIST_MM, GAP_JITTER_MS, GAP_MS, SMALL_HIT, SPEED_MAX_MM_S,
  SPEED_START_MM_S, STICK_MS, TICK_MS, SPAWN_DIST_MM, TIME_BONUS_PER_S, lengthBand, multiplier, RUN_CAP_MS, speedAt,
} from "@/features/qualifier/game/rules";

const [BOSS_1_MS, LAST_BOSS_MS] = BOSS_AT_MS;
import { WORDS } from "@/features/qualifier/words";

const firstAt = (g: Game, t: number) => { advance(g, t); return g.slimes[0]; };
const typeWord = (g: Game, word: string, t: number) => { for (const c of word) press(g, c, t); };

/** Tick by tick from `from` to `to`, popping every small slime once it is within `closeMm`. */
const keepAlive = (g: Game, from: number, to: number, closeMm: number) => {
  for (let t = from; t <= to && !g.ended; t += TICK_MS) {
    advance(g, t);
    for (const s of [...g.slimes]) if (s.kind === "small" && s.distMm <= closeMm) typeWord(g, currentWord(s), t);
  }
};

describe("engine (D790)", () => {
  it("the same seed gives the same slimes", () => {
    const a = newGame(42), b = newGame(42);
    advance(a, 30_000); advance(b, 30_000);
    expect(a.slimes.map((s) => [s.words, s.distMm, s.lane])).toEqual(b.slimes.map((s) => [s.words, s.distMm, s.lane]));
  });
  it("advancing in many small steps equals one big step", () => {
    const a = newGame(7), b = newGame(7);
    for (let t = 0; t < 20_000; t += 17) advance(a, t);
    advance(a, 20_000);
    advance(b, 20_000);
    expect(JSON.stringify(a.slimes)).toBe(JSON.stringify(b.slimes));
  });
  it("no two live slimes share a first letter", () => {
    const g = newGame(3); advance(g, 50_000);
    const firsts = g.slimes.map((s) => currentWord(s)[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });
  it("typing a word pops it and scores length x 10 x multiplier", () => {
    const g = newGame(11); const s = firstAt(g, 3000); const w = currentWord(s);
    typeWord(g, w, 3000);
    expect(g.popped).toBe(1); expect(g.combo).toBe(1); expect(g.score).toBe(w.length * 10 * multiplier(1));
    expect(g.slimes.find((x) => x.id === s.id)).toBeUndefined();
  });
  it("an upper-case letter counts as lower case", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w.toUpperCase(), 3000);
    expect(g.popped).toBe(1);
  });
  it("a wrong letter breaks the combo and costs no points", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w, 3000); expect(g.combo).toBe(1);
    const used = new Set(g.slimes.map((s) => currentWord(s)[0]));
    const bad = "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !used.has(c))!;
    const score = g.score;
    press(g, bad, 3000);
    expect(g.combo).toBe(0); expect(g.score).toBe(score);
  });
  it("slimes come on faster through the run: speed rises smoothly, in whole mm/s, to a top", () => {
    expect(speedAt(0)).toBe(SPEED_START_MM_S);
    expect(speedAt(60_000)).toBe(2100);
    expect(speedAt(120_000)).toBe(2700);
    expect(speedAt(RUN_CAP_MS)).toBe(SPEED_MAX_MM_S);
    expect(SPEED_MAX_MM_S).toBe(3300);
    let last = 0;
    for (let t = 0; t <= 500_000; t += 1000) {
      const v = speedAt(t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(speedAt(30_000)).toBeGreaterThan(speedAt(29_000)); // every second counts
  });
  it("small slimes spawn at a steady pace: 1.8-2.2 s apart all run", () => {
    const g = newGame(11);
    keepAlive(g, 0, BOSS_1_MS - 1, 4000);
    const at = g.events.filter((e) => e.type === "spawn").map((e) => e.t);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    expect(gaps.length).toBeGreaterThan(20);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(GAP_MS);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(GAP_MS + GAP_JITTER_MS + TICK_MS);
  });
  it("words grow longer through the run: 3-5 letters at first, 4-8 at 1:00, 6-10 at 2:00, 7-10 from 2:40", () => {
    expect(lengthBand(0)).toEqual([3, 5]);
    expect(lengthBand(60_000)).toEqual([4, 8]);
    expect(lengthBand(120_000)).toEqual([6, 10]);
    expect(lengthBand(160_000)).toEqual([7, 10]);
    expect(lengthBand(RUN_CAP_MS)).toEqual([7, 10]);
    // Every band has plenty of words, so the first letters stay varied.
    for (let t = 0; t <= 200_000; t += 10_000) {
      const [min, max] = lengthBand(t);
      expect(WORDS.filter((w) => w.length >= min && w.length <= max).length).toBeGreaterThan(250);
    }
  });
  it("multiplier steps every 5 and caps at x5", () => {
    expect([0, 4, 5, 9, 10, 20, 99].map(multiplier)).toEqual([1, 1, 2, 2, 3, 5, 5]);
  });
  it("backspace releases the lock at zero letters and keeps the combo", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w, 3000); const next = currentWord(g.slimes[0]);
    press(g, next[0], 3000); expect(g.lock).not.toBeNull();
    press(g, "\b", 3000); expect(g.lock).toBeNull(); expect(g.combo).toBe(1);
  });
  it("a slime that reaches the player sticks for 3 s, can still be popped, then bursts for SMALL_HIT points and the combo", () => {
    const g = newGame(5); advance(g, 3000); const s = g.slimes[0];
    let t = 3000; while (s.stuckLeftMs === null) advance(g, (t += 50));
    g.score = 1000; g.combo = 7;
    advance(g, t + STICK_MS - 100);
    expect(g.score).toBe(1000);
    advance(g, t + STICK_MS + 100);
    expect(g.score).toBe(1000 - SMALL_HIT); expect(g.combo).toBe(0);
    expect(g.events.find((e) => e.type === "explode" && e.id === s.id)?.points).toBe(SMALL_HIT);
    expect(g.ended).toBe(false);
  });
  it("a burst never takes the score below 0", () => {
    const g = newGame(5); advance(g, 3000); const s = g.slimes[0];
    let t = 3000; while (s.stuckLeftMs === null) advance(g, (t += 50));
    g.score = 40;
    advance(g, t + STICK_MS + 100);
    expect(g.score).toBe(0);
    expect(g.events.find((e) => e.type === "explode" && e.id === s.id)?.points).toBe(40);
  });
  it("with no typing the run lasts the full RUN_CAP_MS (3 minutes), at 0 points", () => {
    const g = newGame(9); finish(g);
    expect(RUN_CAP_MS).toBe(180_000);
    expect(g.ended).toBe(true); expect(g.endedMs).toBe(RUN_CAP_MS); expect(g.score).toBe(0); expect(g.cleared).toBe(false);
    expect(g.events.filter((e) => e.type === "explode").length).toBeGreaterThan(10);
  });
  it("the first boss arrives at 1:30 with 12 words, stops small spawns, and bursts for BOSS_HIT points", () => {
    const g = newGame(21);
    keepAlive(g, 0, BOSS_1_MS, SPAWN_DIST_MM);
    const boss = g.slimes.find((s) => s.kind === "boss")!;
    expect(boss).toBeDefined();
    expect(boss.spawnedMs).toBe(90_000);
    expect(boss.distMm).toBe(BOSS_DIST_MM);
    expect(boss.words.length).toBe(12);
    g.score = 5000;
    let t = BOSS_1_MS, stuckAt: number | null = null;
    for (;;) {
      advance(g, (t += TICK_MS));
      if (!g.slimes.includes(boss)) break;
      expect(g.slimes.every((s) => s.kind === "boss")).toBe(true);
      if (stuckAt === null && boss.stuckLeftMs !== null) stuckAt = t;
    }
    expect(stuckAt).not.toBeNull();
    expect(t - stuckAt!).toBe(STICK_MS);
    expect(g.score).toBe(5000 - BOSS_HIT);
    // With the boss gone, small slimes come again.
    expect(g.slimes.some((s) => s.kind === "small")).toBe(true);
  });
  it("the last boss comes at 2:45 with 10 words, close enough to reach the player as time runs out, and no small slime follows", () => {
    const g = newGame(21);
    keepAlive(g, 0, LAST_BOSS_MS, SPAWN_DIST_MM);
    const boss = g.slimes.find((s) => s.kind === "boss" && s.spawnedMs === 165_000)!;
    expect(boss).toBeDefined();
    expect(boss.distMm).toBe(FINAL_BOSS_DIST_MM);
    expect(boss.words.length).toBe(10);
    const spawnsBefore = g.events.filter((e) => e.type === "spawn").length;
    finish(g);
    expect(g.events.filter((e) => e.type === "spawn").length).toBe(spawnsBefore);
    expect(g.endedMs).toBe(RUN_CAP_MS);
    expect(g.cleared).toBe(false);
    // It walked the whole way: it would bite on the very tick the run ends.
    expect(boss.distMm).toBeLessThanOrEqual(55);
    expect(boss.stuckLeftMs).toBeNull();
  });
  it("a completed boss word keeps the lock on the boss; one backspace with nothing typed releases it", () => {
    const g = newGame(21);
    keepAlive(g, 0, BOSS_1_MS, SPAWN_DIST_MM);
    const boss = g.slimes.find((s) => s.kind === "boss")!;
    const [first, second] = boss.words;
    typeWord(g, first, g.nowMs);
    expect(boss.wordIndex).toBe(1); expect(boss.typed).toBe(0);
    expect(g.lock).toBe(boss.id);
    press(g, second[0], g.nowMs);
    expect(g.lock).toBe(boss.id); expect(boss.typed).toBe(1);
    press(g, "\b", g.nowMs); // back to nothing typed: released, as for any slime
    expect(g.lock).toBeNull();
    typeWord(g, second, g.nowMs);
    expect(boss.wordIndex).toBe(2); expect(g.lock).toBe(boss.id);
    const combo = g.combo;
    press(g, "\b", g.nowMs); // nothing typed of the next word: one backspace releases the boss
    expect(g.lock).toBeNull(); expect(boss.wordIndex).toBe(2); expect(g.combo).toBe(combo);
  });
  it("a boss word and a small slime with the same first letter: a held boss continues, else the nearest wins", () => {
    let found = false;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const g = newGame(seed);
      keepAlive(g, 0, BOSS_1_MS, 8000);
      const boss = g.slimes.find((s) => s.kind === "boss");
      if (g.ended || !boss) continue;
      // The first word must lock the boss itself.
      if (g.slimes.some((s) => s !== boss && currentWord(s)[0] === currentWord(boss)[0])) continue;
      typeWord(g, currentWord(boss), g.nowMs);
      // Walk the boss through the rest of its sentence until one of its words clashes with a small slime.
      while (!found && g.slimes.includes(boss)) {
        expect(g.lock).toBe(boss.id);
        const letter = currentWord(boss)[0];
        const rivals = g.slimes.filter((s) => currentWord(s)[0] === letter);
        if (rivals.length > 1) {
          const nearest = rivals.reduce((a, b) => (b.distMm < a.distMm || (b.distMm === a.distMm && b.id < a.id) ? b : a));
          expect(nearest.id).not.toBe(boss.id); // the small slimes left are nearer than the boss
          press(g, letter, g.nowMs);
          expect(g.lock).toBe(boss.id); // never ambiguous: the boss's next word continues
          press(g, "\b", g.nowMs);
          expect(g.lock).toBeNull();
          press(g, letter, g.nowMs);
          expect(g.lock).toBe(nearest.id);
          found = true;
        } else typeWord(g, currentWord(boss), g.nowMs);
      }
    }
    expect(found).toBe(true);
  });
  it("popping the last boss wins the run there, with TIME_BONUS_PER_S for every whole second left; keys after it do nothing", () => {
    const g = newGame(13);
    // Pop every slime, small or boss, on the tick it appears: only one is ever out.
    let before = 0;
    for (let t = 0; t <= RUN_CAP_MS && !g.ended; t += TICK_MS) {
      advance(g, t);
      before = g.score;
      for (const s of [...g.slimes]) while (g.slimes.includes(s) && !g.ended) typeWord(g, currentWord(s), t);
    }
    expect(g.ended).toBe(true); expect(g.cleared).toBe(true);
    expect(g.endedMs).toBe(LAST_BOSS_MS);
    expect(g.bosses).toBe(2);
    const bonus = 15 * TIME_BONUS_PER_S;
    expect(g.timeBonus).toBe(bonus);
    expect(g.events.filter((e) => e.type === "end")).toEqual([{ t: LAST_BOSS_MS, type: "end", points: bonus }]);
    // The last boss's words, its BOSS_BONUS × 2 and the time bonus.
    expect(g.score - before).toBeGreaterThan(2 * BOSS_BONUS + bonus);
    advance(g, RUN_CAP_MS + 1000);
    const state = JSON.stringify(g);
    for (const k of "abcdefghijklmnopqrstuvwxyz\b") press(g, k, RUN_CAP_MS + 1000);
    expect(JSON.stringify(g)).toBe(state);
  });
  it("keys after the end are ignored", () => {
    const g = newGame(9); finish(g); const score = g.score;
    press(g, "a", g.endedMs! + 1000); expect(g.score).toBe(score);
  });
});
