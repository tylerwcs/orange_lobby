import { describe, expect, it } from "vitest";
import { refusalFor, walkinRefusal, photoSize, PAUSED, OVER, LINK_OFF, waitMessage } from "@/features/polaroid/lib/post-rules";

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

describe("walkinRefusal (D481)", () => {
  const ev = { status: "live" as const, starts_on: "2026-10-12", ends_on: "2026-10-13" };
  it("takes walk-in posts through the event and its grace day", () => {
    expect(walkinRefusal(ev, open, "2026-10-12")).toBeNull();
    expect(walkinRefusal(ev, open, "2026-10-14")).toBeNull();
  });
  it("is over once the crew link's last day has passed, however open the activity is", () => {
    expect(walkinRefusal(ev, open, "2026-10-15")).toBe(OVER);
  });
  it("keeps refusalFor's reasons while the event is live, and never expires an undated event", () => {
    expect(walkinRefusal(ev, { is_open: false, polaroid: { public: true } }, "2026-10-12")).toBe(PAUSED);
    expect(walkinRefusal(ev, { is_open: true, polaroid: { public: false } }, "2026-10-12")).toBe(LINK_OFF);
    expect(walkinRefusal({ status: "live", starts_on: null, ends_on: null }, open, "2030-01-01")).toBeNull();
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
