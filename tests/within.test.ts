import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@/lib/within";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const after = <T,>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms));

describe("within", () => {
  it("gives the promise's value when it settles in time", async () => {
    const p = within(after(100, "ghosts"), 250, "none");
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe("ghosts");
  });

  it("gives the fallback once the time is up, without waiting for the promise", async () => {
    const p = within(after(5_000, "ghosts"), 250, "none");
    await vi.advanceTimersByTimeAsync(250);
    await expect(p).resolves.toBe("none");
  });

  it("passes a rejection through when it comes in time", async () => {
    const p = within(Promise.reject(new Error("db")), 250, "none");
    await expect(p).rejects.toThrow("db");
  });
});
