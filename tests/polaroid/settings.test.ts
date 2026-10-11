import { describe, expect, it } from "vitest";
import { readPolaroidSettings, parseBlockedWords, parseColumns, parseSpeed, DEFAULT_PROMPT } from "@/features/polaroid/lib/settings";

describe("readPolaroidSettings (D475)", () => {
  it("fills every default from nothing", () => {
    expect(readPolaroidSettings(null)).toEqual({
      prompt: DEFAULT_PROMPT, public: false, hidden_builtin: [], stickers: [], blocked_words: [],
      columns: "auto", speed: "medium", background: null,
    });
  });
  it("never throws on a non-object column, and fills the defaults", () => {
    const defaults = readPolaroidSettings(null);
    expect(readPolaroidSettings([])).toEqual(defaults);
    expect(readPolaroidSettings("x")).toEqual(defaults);
    expect(readPolaroidSettings(5)).toEqual(defaults);
  });
  it("keeps good fields and defaults only the damaged one", () => {
    const s = readPolaroidSettings({ prompt: "Say hi!", public: true, columns: 99, speed: "warp" });
    expect(s.prompt).toBe("Say hi!");
    expect(s.public).toBe(true);
    expect(s.columns).toBe("auto");
    expect(s.speed).toBe("medium");
  });
  it("keeps a valid column override and background", () => {
    const s = readPolaroidSettings({ columns: 6, background: { type: "video", url: "https://x.supabase.co/v.mp4" } });
    expect(s.columns).toBe(6);
    expect(s.background).toEqual({ type: "video", url: "https://x.supabase.co/v.mp4" });
  });
});

describe("form parsers", () => {
  it("splits blocked words on lines and commas, lowercases and dedupes", () => {
    expect(parseBlockedWords("Rival Co, rival co\n  competitor \n\n")).toEqual(["rival co", "competitor"]);
  });
  it("drops words over 40 characters and keeps at most 200", () => {
    expect(parseBlockedWords("x".repeat(41))).toEqual([]);
    expect(parseBlockedWords(Array.from({ length: 250 }, (_, i) => `w${i}`).join(","))).toHaveLength(200);
  });
  it("reads columns and speed, falling back safely", () => {
    expect(parseColumns("auto")).toBe("auto");
    expect(parseColumns("7")).toBe(7);
    expect(parseColumns("2")).toBe("auto");
    expect(parseSpeed("fast")).toBe("fast");
    expect(parseSpeed("x")).toBe("medium");
  });
});
