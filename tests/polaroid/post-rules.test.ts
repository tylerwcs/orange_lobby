import { describe, expect, it } from "vitest";
import { refusalFor, photoSize, PAUSED, OVER, LINK_OFF, waitMessage } from "@/features/polaroid/lib/post-rules";

const open = { is_open: true, polaroid: { public: true } };

describe("refusalFor (D478, D481)", () => {
  it("lets an open activity take posts", () => {
    expect(refusalFor({ status: "published" }, open, true)).toBeNull();
    expect(refusalFor({ status: "draft" }, open, false)).toBeNull();
  });
  it("refuses an archived event, a closed activity, and a walk-in when the link is off", () => {
    expect(refusalFor({ status: "archived" }, open, false)).toBe(OVER);
    expect(refusalFor({ status: "published" }, { ...open, is_open: false }, false)).toBe(PAUSED);
    expect(refusalFor({ status: "published" }, { is_open: true, polaroid: { public: false } }, true)).toBe(LINK_OFF);
    expect(refusalFor({ status: "published" }, { is_open: true, polaroid: null }, false)).toBeNull();
  });
});

describe("photoSize", () => {
  it("takes whole pixel sizes from 1 to 4000", () => {
    expect(photoSize(1200, 1600.4)).toEqual({ w: 1200, h: 1600 });
    expect(photoSize(0, 10)).toBeNull();
    expect(photoSize(5000, 10)).toBeNull();
    expect(photoSize("12", 10)).toBeNull();
  });
});

describe("waitMessage", () => {
  it("says how long", () => {
    expect(waitMessage(18)).toBe("You can post again in 18 s.");
  });
});
