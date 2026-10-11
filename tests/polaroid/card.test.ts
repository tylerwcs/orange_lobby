import { describe, expect, it } from "vitest";
import { photoBoxRatio, cardRatio, messageScale, randomTilt, MAX_PHOTO_RATIO, MIN_PHOTO_RATIO } from "@/features/polaroid/lib/card";

describe("photoBoxRatio (D477)", () => {
  it("keeps an ordinary photo's own shape", () => {
    expect(photoBoxRatio(1200, 1600)).toBeCloseTo(4 / 3);
    expect(photoBoxRatio(1600, 900)).toBeCloseTo(9 / 16);
  });
  it("stops at 16:9 tall and 16:9 wide", () => {
    expect(photoBoxRatio(1080, 2400)).toBe(MAX_PHOTO_RATIO);
    expect(photoBoxRatio(4000, 1000)).toBe(MIN_PHOTO_RATIO);
  });
  it("treats missing dimensions as square", () => {
    expect(photoBoxRatio(0, 10)).toBe(1);
  });
});

describe("cardRatio (D483)", () => {
  it("adds the top border and the message strip to the photo box", () => {
    expect(cardRatio(1, 1)).toBeCloseTo(0.055 + 0.89 + 0.27);
  });
});

describe("messageScale", () => {
  it("shrinks longer messages so two lines fit", () => {
    expect(messageScale(10)).toBe(1);
    expect(messageScale(40)).toBe(0.8);
    expect(messageScale(80)).toBe(0.66);
  });
});

describe("randomTilt", () => {
  it("stays within ±3 degrees", () => {
    expect(randomTilt(() => 0)).toBe(-3);
    expect(randomTilt(() => 0.5)).toBe(0);
    expect(randomTilt(() => 0.9999)).toBeLessThanOrEqual(3);
  });
});
