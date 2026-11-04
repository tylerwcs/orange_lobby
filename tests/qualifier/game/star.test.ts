import { describe, expect, it } from "vitest";
import { advance, finish, newGame, press, type Game } from "@/features/qualifier/game/engine";
import {
  BOSS_AT_MS, STAR_BONUS, STAR_FROM_MS, STAR_WINDOW_MS, STAR_WORDS, TICK_MS, starAt,
} from "@/features/qualifier/game/rules";
import { replay } from "@/features/qualifier/game/replay";

/** The run up to its star's moment, with only the star left out (so its keys can't go to another slime). */
function atStar(seed: number): Game {
  const g = newGame(seed);
  advance(g, starAt(seed));
  g.slimes = g.slimes.filter((s) => s.kind === "star");
  g.lock = null;
  return g;
}

describe("the bonus star (D819)", () => {
  it("comes out once a run, on a tick between 0:30 and 1:20, before the first boss", () => {
    const times = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const t = starAt(seed);
      expect(t).toBeGreaterThanOrEqual(STAR_FROM_MS);
      expect(t).toBeLessThan(STAR_FROM_MS + STAR_WINDOW_MS);
      expect(t % TICK_MS).toBe(0);
      expect(t).toBeLessThan(BOSS_AT_MS[0]);
      times.add(t);
    }
    expect(times.size).toBeGreaterThan(50);
    const g = newGame(9);
    finish(g);
    expect(g.events.filter((e) => e.type === "star")).toHaveLength(1);
  });

  it("says cs handsome", () => {
    const g = newGame(5);
    advance(g, starAt(5));
    const star = g.slimes.find((s) => s.kind === "star");
    expect(star?.words).toEqual([...STAR_WORDS]);
    expect(STAR_WORDS.join(" ")).toBe("cs handsome");
    expect(g.events.some((e) => e.type === "star" && e.id === star?.id)).toBe(true);
  });

  it("typed in time, pays its letters plus the bonus", () => {
    const g = atStar(5);
    const t = starAt(5);
    const before = g.score;
    g.combo = 0;
    for (const c of "cshandsome") press(g, c, t);
    expect(g.slimes.some((s) => s.kind === "star")).toBe(false);
    expect(g.stars).toBe(1);
    expect(g.score - before).toBe(20 + 80 + STAR_BONUS);
    expect(g.events.at(-1)).toMatchObject({ type: "pop", points: 80 + STAR_BONUS });
  });

  it("untyped, it gets away: no bite, no points lost, the combo kept", () => {
    const g = atStar(5);
    const id = g.slimes[0].id;
    g.combo = 7;
    const score = g.score;
    advance(g, starAt(5) + 8000);
    expect(g.slimes.some((s) => s.id === id)).toBe(false);
    expect(g.events.filter((e) => e.id === id).map((e) => e.type)).toEqual(["star", "escape"]);
    expect(g.score).toBe(score);
    expect(g.combo).toBe(7);
    expect(g.stars).toBe(0);
  });

  it("the server's replay scores the star the same", () => {
    const seed = 11;
    const t = starAt(seed);
    const g = newGame(seed);
    advance(g, t);
    const star = g.slimes.find((s) => s.kind === "star")!;
    // Clear any other slime on "c" first, then type the star.
    const keys: [string, number][] = [];
    for (const s of g.slimes) if (s !== star && s.words[0][0] === "c") for (const c of s.words.join("")) keys.push([c, t]);
    for (const c of "cshandsome") keys.push([c, t + 100]);
    for (const [c, at] of keys) press(g, c, at);
    finish(g);
    expect(g.stars).toBe(1);
    const r = replay(seed, keys.map(([key, at]) => ({ key, t: at, insert: false })));
    expect(r).toMatchObject({ score: g.score });
  });
});
