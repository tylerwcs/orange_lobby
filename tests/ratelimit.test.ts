import { describe, it, expect } from "vitest";
import { allow } from "@/lib/ratelimit";

describe("ratelimit", () => {
  it("allows up to limit within window", () => {
    const k = "t-" + Math.random();
    expect(allow(k, 2, 60_000)).toBe(true);
    expect(allow(k, 2, 60_000)).toBe(true);
    expect(allow(k, 2, 60_000)).toBe(false);
  });
});
