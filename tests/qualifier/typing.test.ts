import { describe, expect, it } from "vitest";
import { backspace, ghostIndexAt, initialTyping, prefixOf, typeText } from "@/features/qualifier/typing";

const words = ["planet", "orbit"];

describe("typeText", () => {
  it("advances on space only when the word is exact", () => {
    let s = typeText(initialTyping, words, "planex", 100);
    s = typeText(s, words, " ", 200);
    expect(s.index).toBe(0); // wrong word: space ignored…
    expect(s.keys).toBe(7); expect(s.correctKeys).toBe(5); // …and counted as a wrong keystroke
    s = typeText(backspace(s), words, "t ", 900);
    expect(s.index).toBe(1); expect(s.typed).toBe(""); expect(s.offsets).toEqual([900]);
  });
  it("accepts a whole-word commit and counts it", () => {
    const s = typeText(initialTyping, words, "planet ", 1500);
    expect(s.index).toBe(1); expect(s.multiInserts).toBe(1); expect(s.offsets).toEqual([1500]);
  });
  it("treats capitals as lowercase", () => {
    expect(typeText(initialTyping, words, "P", 50).correctKeys).toBe(1);
  });
  it("counts a correct space as a correct key", () => {
    const s = typeText(initialTyping, words, "planet ", 10);
    expect(s.keys).toBe(7); expect(s.correctKeys).toBe(7);
  });
  it("appends wrong letters so they must be backspaced", () => {
    const s = typeText(initialTyping, words, "px", 10);
    expect(s.typed).toBe("px"); expect(s.keys).toBe(2); expect(s.correctKeys).toBe(1);
  });
  it("does not change the input state", () => {
    const before = typeText(initialTyping, words, "plan", 10);
    const snapshot = JSON.stringify(before);
    typeText(before, words, "et ", 20);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(initialTyping).toEqual({ index: 0, typed: "", keys: 0, correctKeys: 0, multiInserts: 0, offsets: [] });
  });
  it("ignores other whitespace, and any input after the last word", () => {
    expect(typeText(initialTyping, words, "\n", 5)).toEqual(initialTyping);
    const done = typeText(initialTyping, words, "planet orbit ", 5);
    expect(done.index).toBe(2);
    expect(typeText(done, words, "x", 6)).toEqual(done);
  });
  it("treats a non-breaking space as a space", () => {
    expect(typeText(initialTyping, words, "planet ", 7).index).toBe(1);
  });
  it("counts a single character as no multi-insert", () => {
    expect(typeText(initialTyping, words, "p", 5).multiInserts).toBe(0);
  });
});

describe("backspace", () => {
  it("removes the last letter and never touches the counters", () => {
    const s = typeText(initialTyping, words, "plx", 10);
    const b = backspace(s);
    expect(b.typed).toBe("pl"); expect(b.keys).toBe(3); expect(b.correctKeys).toBe(2);
  });
  it("cannot go back into a finished word", () => {
    const s = typeText(initialTyping, words, "planet ", 10);
    expect(backspace(s)).toEqual(s);
  });
});

describe("prefixOf", () => {
  it("counts only the correct leading letters", () => {
    expect(prefixOf(typeText(initialTyping, words, "plx", 10), words)).toBe(2);
  });
  it("is 0 when nothing is typed or the run is finished", () => {
    expect(prefixOf(initialTyping, words)).toBe(0);
    expect(prefixOf(typeText(initialTyping, words, "planet orbit ", 10), words)).toBe(0);
  });
});

describe("ghostIndexAt", () => {
  it("replays words done by a time", () => {
    expect(ghostIndexAt([1000, 2500], 2000)).toBe(1);
    expect(ghostIndexAt([1000, 2500], 2500)).toBe(2);
  });
  it("is 0 before the first word and the length after the last", () => {
    expect(ghostIndexAt([1000, 2500], 999)).toBe(0);
    expect(ghostIndexAt([1000, 2500], 99_999)).toBe(2);
    expect(ghostIndexAt([], 5)).toBe(0);
  });
});
