import { describe, expect, it } from "vitest";
import { keysFromInput, perfOrigin } from "@/features/qualifier/game/keys";

describe("keysFromInput", () => {
  it("is one lowercase key for one typed letter", () => {
    expect(keysFromInput("", "a")).toEqual({ keys: ["a"], insert: false });
  });
  it("lowercases a multi-letter change and marks it an insert", () => {
    expect(keysFromInput("", "Hello")).toEqual({ keys: ["h", "e", "l", "l", "o"], insert: true });
  });
  it("turns each removed character into a backspace", () => {
    expect(keysFromInput("ab", "a")).toEqual({ keys: ["\b"], insert: false });
    expect(keysFromInput("abc", "")).toEqual({ keys: ["\b", "\b", "\b"], insert: false });
  });
  it("drops anything that is not a letter", () => {
    expect(keysFromInput("", "a1-b").keys).toEqual(["a", "b"]);
    expect(keysFromInput("", " ")).toEqual({ keys: [], insert: false });
  });
  it("puts the backspaces before the new letters (a composing keyboard rewriting its word)", () => {
    expect(keysFromInput("helo", "hello")).toEqual({ keys: ["\b", "l", "o"], insert: true });
  });
  it("is an insert only when more than one letter arrived", () => {
    expect(keysFromInput("", "a ").insert).toBe(false);
    expect(keysFromInput("", "ab").insert).toBe(true);
  });
});

describe("perfOrigin", () => {
  it("places the server's start on the performance clock", () => {
    // Server is 2 s ahead of this phone; the run starts 3 s after the server's now.
    const dateNow = 1_000_000;
    const offset = 2000;
    const startsAt = dateNow + offset + 3000;
    expect(perfOrigin(startsAt, offset, dateNow, 500)).toBe(3500);
  });
});
