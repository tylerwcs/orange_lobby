import { describe, expect, it } from "vitest";
import { IMAGE_RETRIES, imageRetryDelay } from "@/lib/games/image-retry";

describe("imageRetryDelay (polish D323)", () => {
  it("backs off from 15 s, doubling each time", () => {
    expect([1, 2, 3, 4].map(imageRetryDelay)).toEqual([15_000, 30_000, 60_000, 120_000]);
  });
  it("gives up after IMAGE_RETRIES retries", () => {
    expect(IMAGE_RETRIES).toBe(4);
    expect(imageRetryDelay(IMAGE_RETRIES + 1)).toBeNull();
    expect(imageRetryDelay(50)).toBeNull();
  });
  it("has no delay before anything has failed, or for a nonsense count", () => {
    expect(imageRetryDelay(0)).toBeNull();
    expect(imageRetryDelay(-1)).toBeNull();
    expect(imageRetryDelay(1.5)).toBeNull();
    expect(imageRetryDelay(Number.NaN)).toBeNull();
  });
});
