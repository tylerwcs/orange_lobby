import { describe, expect, it } from "vitest";
import { deviceOf, inputDiff, isPhysicalKey } from "@/features/qualifier/input";

describe("inputDiff", () => {
  it("reports what a composition added", () => {
    expect(inputDiff("", "a")).toEqual({ backspaces: 0, text: "a" });
    expect(inputDiff("hel", "hello")).toEqual({ backspaces: 0, text: "lo" });
  });
  it("reports what it removed", () => {
    expect(inputDiff("hello", "hell")).toEqual({ backspaces: 1, text: "" });
    expect(inputDiff("hi", "")).toEqual({ backspaces: 2, text: "" });
  });
  it("reports a replacement as removals then the new tail", () => {
    expect(inputDiff("teh", "the")).toEqual({ backspaces: 2, text: "he" });
  });
  it("reports nothing for no change", () => {
    expect(inputDiff("abc", "abc")).toEqual({ backspaces: 0, text: "" });
  });
});

describe("isPhysicalKey", () => {
  it("is a one-character key that is not an IME placeholder", () => {
    expect(isPhysicalKey({ key: "a", keyCode: 65, isComposing: false })).toBe(true);
    expect(isPhysicalKey({ key: " ", keyCode: 32, isComposing: false })).toBe(true);
  });
  it("is not Android's Unidentified/229, a composing key, or a named key", () => {
    expect(isPhysicalKey({ key: "Unidentified", keyCode: 229, isComposing: false })).toBe(false);
    expect(isPhysicalKey({ key: "a", keyCode: 229, isComposing: false })).toBe(false);
    expect(isPhysicalKey({ key: "a", keyCode: 65, isComposing: true })).toBe(false);
    expect(isPhysicalKey({ key: "Backspace", keyCode: 8, isComposing: false })).toBe(false);
  });
});

describe("deviceOf", () => {
  it("is touch on a coarse pointer with no physical key seen", () => {
    expect(deviceOf(true, false)).toBe("touch");
  });
  it("is keyboard once a physical key is seen, or on a fine pointer", () => {
    expect(deviceOf(true, true)).toBe("keyboard");
    expect(deviceOf(false, false)).toBe("keyboard");
  });
});
