import { describe, expect, it } from "vitest";
import { advance, currentWord, newGame, press, type Game } from "@/features/qualifier/game/engine";
import { BARS, BPM, STEPS_PER_BAR, scoreAt } from "@/features/qualifier/game/music";
import { SKY } from "@/features/qualifier/game/palette";
import { BOSS_AT_MS, BOSS_BONUS, RUN_CAP_MS, SPAWN_DIST_MM, TICK_MS } from "@/features/qualifier/game/rules";
import { SKY_STOPS, skyAt } from "@/features/qualifier/game/sky";
import { statsOf } from "@/features/qualifier/components/game/Results";

const typeWord = (g: Game, word: string, t: number) => { for (const c of word) press(g, c, t); };
const LOOP = BARS * STEPS_PER_BAR;

describe("the run's light (D816)", () => {
  it("starts as the morning sky, holds it before the start, and ends at the last stop", () => {
    expect(skyAt(-3000).sky).toBe(SKY);
    expect(skyAt(0).sky).toBe(SKY);
    expect(skyAt(30_000).sky).toBe(SKY);
    expect(skyAt(RUN_CAP_MS)).toEqual(SKY_STOPS[SKY_STOPS.length - 1][1]);
    expect(skyAt(RUN_CAP_MS + 60_000)).toEqual(SKY_STOPS[SKY_STOPS.length - 1][1]);
  });

  it("is warm by the last boss and moves smoothly: a second never jumps a colour channel by more than a few steps", () => {
    const sunset = skyAt(BOSS_AT_MS[1]);
    expect((sunset.sky >> 16) & 255).toBeGreaterThan(sunset.sky & 255); // red over blue
    for (let t = 0; t < RUN_CAP_MS; t += 1000) {
      const a = skyAt(t).sky, b = skyAt(t + 1000).sky;
      for (const shift of [16, 8, 0]) expect(Math.abs(((a >> shift) & 255) - ((b >> shift) & 255))).toBeLessThanOrEqual(4);
    }
  });
});

describe("the music's final boss and on-fire drums (D816)", () => {
  it("plays the last boss faster than the first", () => {
    expect(BPM.final).toBeGreaterThan(BPM.boss);
  });

  it("adds drums on fire, and only adds", () => {
    for (const mood of ["play", "boss", "final"] as const) {
      let plain = 0, fire = 0;
      for (let s = 0; s < LOOP; s++) {
        const a = scoreAt(mood, s), b = scoreAt(mood, s, true);
        for (const n of a) expect(b).toContainEqual(n);
        plain += a.length;
        fire += b.length;
      }
      expect(fire).toBeGreaterThan(plain);
    }
    // The title tune has no drums, on fire or not.
    for (let s = 0; s < LOOP; s++) expect(scoreAt("title", s, true)).toEqual(scoreAt("title", s));
  });
});

describe("points on events and the run's stats (D816)", () => {
  it("a pop's event carries the points it scored; a typo and the best combo are counted", () => {
    const g = newGame(11);
    advance(g, 3000);
    const s = g.slimes[0];
    const w = currentWord(s);
    const before = g.score;
    typeWord(g, w, 3000);
    const pop = g.events.find((e) => e.type === "pop" && e.id === s.id)!;
    expect(pop.points).toBe(g.score - before);
    expect(g.letters).toBe(w.length);
    expect(g.bestCombo).toBe(1);
    const used = new Set(g.slimes.map((x) => currentWord(x)[0]));
    press(g, "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !used.has(c))!, 3000);
    expect(g.misses).toBe(1);
    expect(g.combo).toBe(0);
    expect(g.bestCombo).toBe(1);
  });

  it("a boss's pop carries its word's points and its bonus", () => {
    const g = newGame(21);
    for (let t = 0; t <= BOSS_AT_MS[0]; t += TICK_MS) {
      advance(g, t);
      for (const x of [...g.slimes]) if (x.kind === "small" && x.distMm <= SPAWN_DIST_MM) while (g.slimes.includes(x)) typeWord(g, currentWord(x), t);
    }
    const boss = g.slimes.find((x) => x.kind === "boss")!;
    while (g.slimes.includes(boss)) typeWord(g, currentWord(boss), g.nowMs);
    const words = g.events.filter((e) => e.id === boss.id && e.type === "word");
    const pop = g.events.find((e) => e.id === boss.id && e.type === "pop")!;
    expect(words.length).toBe(boss.words.length - 1);
    expect(words.every((e) => (e.points ?? 0) > 0)).toBe(true);
    expect(pop.points!).toBeGreaterThan(BOSS_BONUS);
  });

  it("statsOf: accuracy is right letters of all typed, words a minute counts five letters a word", () => {
    const base = { popped: 30, bosses: 1, bestCombo: 17, cleared: false, timeBonus: 0 };
    const counts = { ...base, stars: 1 };
    expect(statsOf({ ...counts, letters: 900, misses: 100 }, 180_000)).toEqual({ ...base, star: true, accuracy: 90, wpm: 60 });
    expect(statsOf({ ...counts, letters: 0, misses: 0 }, 180_000)).toMatchObject({ accuracy: 0, wpm: 0 });
    expect(statsOf({ ...counts, letters: 10, misses: 0 }, 0)).toMatchObject({ accuracy: 100, wpm: 0 });
  });
});
