import { describe, expect, it } from "vitest";
import { newGame, advance, press, finish, currentWord, type Game } from "@/features/qualifier/game/engine";
import { BOSS_FIRST_MS, START_HEALTH, STICK_MS, TICK_MS, SPAWN_DIST_MM, multiplier, RUN_CAP_MS } from "@/features/qualifier/game/rules";

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
    for (let t = 0; t <= 20_000; t += 17) advance(a, t);
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
  it("a wrong letter breaks the combo and costs no health", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w, 3000); expect(g.combo).toBe(1);
    const used = new Set(g.slimes.map((s) => currentWord(s)[0]));
    const bad = "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !used.has(c))!;
    press(g, bad, 3000);
    expect(g.combo).toBe(0); expect(g.health).toBe(START_HEALTH);
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
  it("a slime that reaches the player sticks for 3 s, can still be popped, then explodes for 1 health", () => {
    const g = newGame(5); advance(g, 3000); const s = g.slimes[0];
    let t = 3000; while (s.stuckLeftMs === null) advance(g, (t += 50));
    advance(g, t + STICK_MS - 100);
    expect(g.health).toBe(START_HEALTH);
    advance(g, t + STICK_MS + 100);
    expect(g.health).toBe(START_HEALTH - 1); expect(g.combo).toBe(0);
  });
  it("with no typing the run ends at 0 health with endedMs set", () => {
    const g = newGame(9); finish(g);
    expect(g.ended).toBe(true); expect(g.health).toBeLessThanOrEqual(0); expect(g.endedMs).toBeGreaterThan(0);
    expect(g.endedMs!).toBeLessThan(RUN_CAP_MS);
  });
  it("a boss arrives at about one minute, stops small spawns, and costs 2 health", () => {
    const g = newGame(21);
    keepAlive(g, 0, BOSS_FIRST_MS, SPAWN_DIST_MM);
    const boss = g.slimes.find((s) => s.kind === "boss")!;
    expect(boss).toBeDefined();
    expect(boss.spawnedMs).toBe(BOSS_FIRST_MS);
    expect(boss.words.length).toBeGreaterThanOrEqual(5);
    expect(g.health).toBe(START_HEALTH);
    let t = BOSS_FIRST_MS, stuckAt: number | null = null;
    for (;;) {
      advance(g, (t += TICK_MS));
      if (!g.slimes.includes(boss)) break;
      expect(g.slimes.every((s) => s.kind === "boss")).toBe(true);
      if (stuckAt === null && boss.stuckLeftMs !== null) stuckAt = t;
    }
    expect(stuckAt).not.toBeNull();
    expect(t - stuckAt!).toBe(STICK_MS);
    expect(g.health).toBe(START_HEALTH - 2);
    // With the boss gone, small slimes come again.
    expect(g.slimes.some((s) => s.kind === "small")).toBe(true);
  });
  it("a boss word and a small slime with the same first letter: the nearest wins", () => {
    let found = false;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const g = newGame(seed);
      keepAlive(g, 0, BOSS_FIRST_MS, 8000);
      const boss = g.slimes.find((s) => s.kind === "boss");
      if (g.ended || !boss) continue;
      // Walk the boss through its sentence until one of its words clashes with a small slime.
      while (!found && g.slimes.includes(boss)) {
        const letter = currentWord(boss)[0];
        const rivals = g.slimes.filter((s) => currentWord(s)[0] === letter);
        if (rivals.length > 1) {
          const nearest = rivals.reduce((a, b) => (b.distMm < a.distMm || (b.distMm === a.distMm && b.id < a.id) ? b : a));
          press(g, letter, g.nowMs);
          expect(g.lock).toBe(nearest.id);
          found = true;
        } else typeWord(g, currentWord(boss), g.nowMs);
      }
    }
    expect(found).toBe(true);
  });
  it("a run kept alive to the cap ends at RUN_CAP_MS, and keys after it do nothing", () => {
    const g = newGame(13);
    // Pop every slime, small or boss, on the tick it appears: only one is ever out.
    for (let t = 0; t <= RUN_CAP_MS && !g.ended; t += TICK_MS) {
      advance(g, t);
      for (const s of [...g.slimes]) while (g.slimes.includes(s)) typeWord(g, currentWord(s), t);
    }
    expect(g.ended).toBe(true);
    expect(g.endedMs).toBe(RUN_CAP_MS);
    expect(g.health).toBe(START_HEALTH);
    expect(g.bosses).toBeGreaterThan(5);
    expect(g.events.filter((e) => e.type === "end")).toEqual([{ t: RUN_CAP_MS, type: "end" }]);
    advance(g, RUN_CAP_MS + 1000);
    const before = JSON.stringify(g);
    for (const k of "abcdefghijklmnopqrstuvwxyz\b") press(g, k, RUN_CAP_MS + 1000);
    expect(JSON.stringify(g)).toBe(before);
  });
  it("keys after the end are ignored", () => {
    const g = newGame(9); finish(g); const score = g.score;
    press(g, "a", g.endedMs! + 1000); expect(g.score).toBe(score);
  });
});
