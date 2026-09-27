import { describe, expect, it, vi } from "vitest";
import { createMemo } from "@/lib/games/memo";

describe("createMemo", () => {
  it("loads once within the time-to-live", async () => {
    let now = 0;
    const memo = createMemo<number>(1000, () => now);
    const load = vi.fn(async () => 42);
    await memo.get("k", load);
    now = 999;
    await memo.get("k", load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("loads again once the time-to-live has passed", async () => {
    let now = 0;
    const memo = createMemo<number>(1000, () => now);
    const load = vi.fn(async () => 1);
    await memo.get("k", load);
    now = 1000;
    await memo.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("shares one load between callers that arrive together", async () => {
    const memo = createMemo<number>(1000, () => 0);
    const load = vi.fn(async () => 7);
    const [a, b] = await Promise.all([memo.get("k", load), memo.get("k", load)]);
    expect([a, b, load.mock.calls.length]).toEqual([7, 7, 1]);
  });
  it("does not keep a failed load", async () => {
    const memo = createMemo<number>(1000, () => 0);
    await expect(memo.get("k", async () => { throw new Error("db down"); })).rejects.toThrow("db down");
    await expect(memo.get("k", async () => 5)).resolves.toBe(5);
  });
  it("forgets a key on clear", async () => {
    const memo = createMemo<number>(1000, () => 0);
    const load = vi.fn(async () => 1);
    await memo.get("k", load);
    memo.clear("k");
    await memo.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
