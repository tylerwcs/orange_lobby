import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { BUILTIN_STICKERS, stickerTray, stickerSources, newEventStickerId } from "@/features/polaroid/lib/stickers";
import { readPolaroidSettings } from "@/features/polaroid/lib/settings";

describe("the built-in pack (D483)", () => {
  it("has 18 stickers with unique ids and a file each", () => {
    expect(BUILTIN_STICKERS).toHaveLength(18);
    expect(new Set(BUILTIN_STICKERS.map((s) => s.id)).size).toBe(18);
    for (const s of BUILTIN_STICKERS) expect(existsSync(path.join("public", s.src))).toBe(true);
  });
});

describe("stickerTray", () => {
  it("puts the event's stickers first, then the visible built-ins", () => {
    const settings = readPolaroidSettings({
      stickers: [{ id: "ev-abcd1234", url: "https://x.supabase.co/logo.png", name: "Logo" }],
      hidden_builtin: ["heart"],
    });
    const tray = stickerTray(settings);
    expect(tray[0]).toEqual({ id: "ev-abcd1234", name: "Logo", src: "https://x.supabase.co/logo.png" });
    expect(tray.some((s) => s.id === "heart")).toBe(false);
    expect(tray).toHaveLength(1 + 17);
  });
});

describe("stickerSources (Review Focus 4)", () => {
  it("still draws a hidden built-in, but not an event sticker that was deleted", () => {
    const settings = readPolaroidSettings({ hidden_builtin: ["heart"], stickers: [] });
    const src = stickerSources(settings);
    expect(src.heart).toBe("/polaroid-stickers/heart.svg");
    expect(src["ev-gone0000"]).toBeUndefined();
  });
});

describe("newEventStickerId", () => {
  it("makes ev- plus 8 lowercase letters or digits", () => {
    expect(newEventStickerId()).toMatch(/^ev-[a-z0-9]{8}$/);
  });
});
