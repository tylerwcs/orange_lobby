import { describe, expect, it } from "vitest";
import { advance, currentWord, finish, newGame, press, type Game } from "@/features/qualifier/game/engine";
import { replay } from "@/features/qualifier/game/replay";
import { CEILING_KEYS } from "@/features/qualifier/game/rules";
import { checkSpeed, type Entry } from "@/features/qualifier/game/timeline";

/** A letter no live slime's word starts with, and not `also`. */
const unused = (g: Game, also = "") => {
  const used = new Set(g.slimes.map((s) => currentWord(s)[0]));
  return "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !used.has(c) && c !== also)!;
};

describe("replay (D791)", () => {
  it("a run played key by key on the client replays to the same result", () => {
    const g = newGame(1234); const entries: Entry[] = []; const accepted: number[] = [];
    // a bot that types the nearest slime's word at 6 letters/s, with one wrong letter every 15 keys
    let t = 0;
    while (!g.ended && t < 400_000) {
      t += 160 + Math.floor((t / 160) % 7) * 10;
      advance(g, t);
      if (g.ended) break;
      const target = g.lock !== null ? g.slimes.find((s) => s.id === g.lock) : [...g.slimes].sort((a, b) => a.distMm - b.distMm)[0];
      if (!target) continue;
      const key = entries.length % 15 === 14 ? "q" : currentWord(target)[target.typed] ?? currentWord(target)[0];
      const before = g.events.length;
      press(g, key, t); entries.push({ key, t, insert: false });
      if (g.events.slice(before).some((e) => e.type === "letter")) accepted.push(t);
    }
    finish(g);
    expect(entries.length).toBeGreaterThan(100);
    expect(g.score).toBeGreaterThan(0);
    expect(replay(1234, entries)).toEqual({ score: g.score, endedMs: g.endedMs, popped: g.popped, bosses: g.bosses, letters: accepted });
    expect(accepted.length).toBeLessThan(entries.length); // the wrong letters are left out
    expect(checkSpeed(accepted)).toBeNull(); // a hand's pace
  });

  it("refuses an entry after the game ended", () => {
    const g = newGame(7);
    finish(g);
    const end = g.endedMs as number;
    expect(replay(7, [{ key: "a", t: end + 1000, insert: false }])).toEqual({ refused: "after_end" });
  });

  it("an empty timeline replays to score 0 and the same endedMs as finish(newGame(seed))", () => {
    const g = newGame(99);
    finish(g);
    expect(replay(99, [])).toEqual({ score: 0, endedMs: g.endedMs, popped: 0, bosses: 0, letters: [] });
  });

  describe("letters: the times of the letters the engine accepted (Ruling 17)", () => {
    it("holds the locking, the next and the completing letter once each; never a wrong letter, a backspace or an insert", () => {
      const g = newGame(11); advance(g, 3000);
      expect(g.slimes.length).toBeGreaterThanOrEqual(2);
      const [w, v] = [currentWord(g.slimes[0]), currentWord(g.slimes[1])];
      const entries: Entry[] = [
        { key: w[0], t: 3000, insert: false }, // locks the slime
        { key: unused(g, w[1]), t: 3010, insert: false }, // wrong while locked
        ...Array.from(w.slice(1), (key, i) => ({ key, t: 3020 + i * 10, insert: false })), // the last one pops it
        { key: "\b", t: 3500, insert: false }, // nothing locked: does nothing
        { key: unused(g), t: 3600, insert: false }, // no slime starts with it: wrong
        ...Array.from(v, (key) => ({ key, t: 3700, insert: true })), // accepted, but inserted: flagged instead
      ];
      const r = replay(11, entries);
      if ("refused" in r) throw new Error("refused");
      expect(r.popped).toBe(2);
      expect(r.letters).toEqual([3000, ...Array.from(w.slice(1), (_, i) => 3020 + i * 10)]);
    });

    it("100 wrong letters in 2 s are no letters, so not too fast", () => {
      const g = newGame(5); advance(g, 6000);
      const bad = unused(g); // no slime out by 6 s starts with it
      const entries = Array.from({ length: 100 }, (_, i) => ({ key: bad, t: 4000 + i * 20, insert: false }));
      expect(entries.length).toBeGreaterThan(CEILING_KEYS);
      const r = replay(5, entries);
      if ("refused" in r) throw new Error("refused");
      expect(r.letters).toEqual([]);
      expect(checkSpeed(r.letters)).toBeNull();
    });

    it("backspaces in 2 s are not letters, so not too fast", () => {
      const g = newGame(11); advance(g, 3000);
      const w = currentWord(g.slimes[0]);
      const backs = Array.from({ length: 100 }, (_, i) => ({ key: "\b", t: 3000 + i * 20, insert: false }));
      const r = replay(11, [{ key: w[0], t: 3000, insert: false }, ...backs]);
      if ("refused" in r) throw new Error("refused");
      expect(r.letters).toEqual([3000]);
      expect(checkSpeed(r.letters)).toBeNull();
    });
  });
});
