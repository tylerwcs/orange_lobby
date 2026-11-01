import { describe, expect, it } from "vitest";
import { BARS, BPM, STEPS_PER_BAR, hz, scoreAt, stepSeconds, type Mood, type Note } from "@/features/qualifier/game/music";
import { playMusic, sfx, stopMusic } from "@/features/qualifier/game/sound";

const LOOP = BARS * STEPS_PER_BAR;
const loop = (mood: Mood): Note[][] => Array.from({ length: LOOP }, (_, s) => scoreAt(mood, s));
const pitchClass = (m: number) => ((m % 12) + 12) % 12;
/** C major, and A harmonic minor (its E chord has G#). */
const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const A_HARMONIC = new Set([9, 11, 0, 2, 4, 5, 8]);

describe("the background music (D794)", () => {
  it("loops: step n and n + one loop play the same, any loop", () => {
    for (const mood of ["title", "play", "boss"] as const) {
      for (let s = 0; s < LOOP; s++) expect(scoreAt(mood, s + LOOP * 3)).toEqual(scoreAt(mood, s));
    }
  });

  it("keeps every note in a sane range and in key", () => {
    for (const mood of ["title", "play", "boss"] as const) {
      const key = mood === "boss" ? A_HARMONIC : C_MAJOR;
      for (const n of loop(mood).flat()) {
        if (n.midi === undefined) continue;
        expect(n.midi).toBeGreaterThanOrEqual(36);
        expect(n.midi).toBeLessThanOrEqual(96);
        expect(key.has(pitchClass(n.midi)), `${mood} ${n.voice} ${n.midi}`).toBe(true);
        expect(n.len).toBeGreaterThan(0);
      }
    }
  });

  it("has drums in a run, a beat on every bar, and none on the title screen", () => {
    expect(loop("title").flat().some((n) => ["kick", "snare", "hat"].includes(n.voice))).toBe(false);
    for (const mood of ["play", "boss"] as const) {
      for (let bar = 0; bar < BARS; bar++) expect(scoreAt(mood, bar * STEPS_PER_BAR).some((n) => n.voice === "kick")).toBe(true);
    }
  });

  it("has a melody in the title and a run, and gets faster for a boss", () => {
    expect(loop("play").flat().filter((n) => n.voice === "lead").length).toBeGreaterThan(16);
    expect(loop("title").flat().some((n) => n.voice === "lead")).toBe(true);
    expect(BPM.title).toBeLessThan(BPM.play);
    expect(BPM.play).toBeLessThan(BPM.boss);
    expect(stepSeconds("play")).toBeCloseTo(60 / 116 / 4);
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBeCloseTo(880);
  });

  it("is silent, never an error, where there is no WebAudio (as in node)", () => {
    expect(() => {
      playMusic("play");
      sfx("combo");
      stopMusic();
    }).not.toThrow();
  });
});
