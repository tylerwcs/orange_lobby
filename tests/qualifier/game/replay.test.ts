import { describe, expect, it } from "vitest";
import { advance, currentWord, finish, newGame, press } from "@/features/qualifier/game/engine";
import { replay } from "@/features/qualifier/game/replay";
import { type Entry } from "@/features/qualifier/game/timeline";

describe("replay (D791)", () => {
  it("a run played key by key on the client replays to the same result", () => {
    const g = newGame(1234); const entries: Entry[] = [];
    // a bot that types the nearest slime's word at 6 letters/s, with one wrong letter every 15 keys
    let t = 0;
    while (!g.ended && t < 400_000) {
      t += 160 + Math.floor((t / 160) % 7) * 10;
      advance(g, t);
      if (g.ended) break;
      const target = g.lock !== null ? g.slimes.find((s) => s.id === g.lock) : [...g.slimes].sort((a, b) => a.distMm - b.distMm)[0];
      if (!target) continue;
      const key = entries.length % 15 === 14 ? "q" : currentWord(target)[target.typed] ?? currentWord(target)[0];
      press(g, key, t); entries.push({ key, t, insert: false });
    }
    finish(g);
    expect(entries.length).toBeGreaterThan(100);
    expect(g.score).toBeGreaterThan(0);
    expect(replay(1234, entries)).toEqual({ score: g.score, endedMs: g.endedMs, popped: g.popped, bosses: g.bosses });
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
    expect(replay(99, [])).toEqual({ score: 0, endedMs: g.endedMs, popped: 0, bosses: 0 });
  });
});
