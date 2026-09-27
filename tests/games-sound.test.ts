import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynth, MUTE_KEY, readMuted, silentSynth, writeMuted } from "@/lib/games/sound";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("mute (D302)", () => {
  it("starts unmuted", () => {
    expect(readMuted(memory())).toBe(false);
    expect(readMuted(null)).toBe(false);
  });
  it("remembers muted per machine", () => {
    const s = memory();
    writeMuted(s, true);
    expect(s.getItem(MUTE_KEY)).toBe("1");
    expect(readMuted(s)).toBe(true);
  });
  it("survives storage that throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readMuted(broken)).toBe(false);
    expect(() => writeMuted(broken, true)).not.toThrow();
  });
});

describe("createSynth", () => {
  it("does nothing, without throwing, where there is no Web Audio (the server, tests)", () => {
    const s = createSynth();
    expect(() => { s.unlock(); s.play("fanfare"); s.play("drumroll", 3000); }).not.toThrow();
  });
  it("tracks muted", () => {
    const s = createSynth();
    s.setMuted(true);
    expect(s.isMuted()).toBe(true);
  });
  describe("where the browser refuses an AudioContext", () => {
    afterEach(() => { vi.unstubAllGlobals(); });
    it("stays silent instead of throwing", () => {
      let made = 0;
      class Refused { constructor() { made++; throw new Error("NotSupportedError"); } }
      vi.stubGlobal("window", { AudioContext: Refused });
      const s = createSynth();
      expect(() => { s.unlock(); s.play("fanfare"); s.play("drumroll", 3000); s.play("tick"); }).not.toThrow();
      expect(made).toBe(1);
    });
  });
  it("has a silent stand-in", () => {
    expect(() => silentSynth.play("tick")).not.toThrow();
  });
});
