import { describe, expect, it } from "vitest";
import {
  backgroundFromForm, backgroundOf, backgroundSchema, CHROMA_GREEN, confettiColours, DEFAULT_BACKGROUND,
} from "@/lib/games/background";

describe("backgroundSchema (D297)", () => {
  it("reads a missing background as Theme", () => {
    expect(backgroundSchema.parse(undefined)).toEqual(DEFAULT_BACKGROUND);
  });
  it("keeps green and drops any url on it", () => {
    expect(backgroundSchema.parse({ kind: "green", url: "https://x.test/a.png" })).toEqual({ kind: "green", url: null });
  });
  it("keeps an image with its url", () => {
    expect(backgroundSchema.parse({ kind: "image", url: "https://x.test/a.png" })).toEqual({ kind: "image", url: "https://x.test/a.png" });
  });
  it("reads an image or video with no url as Theme", () => {
    expect(backgroundSchema.parse({ kind: "video", url: null })).toEqual(DEFAULT_BACKGROUND);
  });
  it("reads anything unreadable as Theme rather than failing the game", () => {
    expect(backgroundSchema.parse({ kind: "disco", url: 3 })).toEqual(DEFAULT_BACKGROUND);
  });
});

describe("backgroundOf", () => {
  it("is Theme with no game on stage", () => {
    expect(backgroundOf(null)).toEqual(DEFAULT_BACKGROUND);
  });
  it("is the game's background", () => {
    expect(backgroundOf({ config: { background: { kind: "green", url: null } } })).toEqual({ kind: "green", url: null });
  });
});

describe("confettiColours (D299)", () => {
  it("has green normally and none in green mode", () => {
    expect(confettiColours(false)).toContain("#22C55E");
    expect(confettiColours(true).some((c) => c === "#22C55E" || c === CHROMA_GREEN)).toBe(false);
  });
});

describe("backgroundFromForm (D300)", () => {
  const ours = (u: string) => u.startsWith("https://sb.test/");
  it("theme and green need nothing", () => {
    expect(backgroundFromForm("green", { image: null, video: null, ours })).toEqual({ ok: true, background: { kind: "green", url: null } });
  });
  it("an image needs an uploaded or kept image", () => {
    expect(backgroundFromForm("image", { image: null, video: null, ours }).ok).toBe(false);
    expect(backgroundFromForm("image", { image: "https://sb.test/a.png", video: null, ours }))
      .toEqual({ ok: true, background: { kind: "image", url: "https://sb.test/a.png" } });
  });
  it("a video must be one we stored", () => {
    expect(backgroundFromForm("video", { image: null, video: "https://evil.test/v.mp4", ours }).ok).toBe(false);
    expect(backgroundFromForm("video", { image: null, video: "https://sb.test/v.mp4", ours }))
      .toEqual({ ok: true, background: { kind: "video", url: "https://sb.test/v.mp4" } });
  });
  it("an unknown kind is refused", () => {
    expect(backgroundFromForm("disco", { image: null, video: null, ours }).ok).toBe(false);
  });
});
