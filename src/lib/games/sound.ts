/**
 * The LED's sound (D301, D302): every effect synthesised with Web Audio, so there are no audio
 * files and nothing to license. Phones play none. Safe to import anywhere: nothing touches
 * `window` until a synth is used in a browser.
 */
export const MUTE_KEY = "ecphub.display.muted";

export function readMuted(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(storage: Pick<Storage, "setItem"> | null, muted: boolean): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private window or blocked storage: the choice lasts until reload */
  }
}

export type Sfx = "tick" | "go" | "drumroll" | "slice" | "clunk" | "whoosh" | "lift" | "flip" | "fanfare";

export type Synth = {
  /** Call from a click: browsers start audio only after a user gesture (D302). */
  unlock(): void;
  play(sfx: Sfx, durationMs?: number): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
};

export const silentSynth: Synth = { unlock() {}, play() {}, setMuted() {}, isMuted: () => true };

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  /** Web Audio would not start here; stay silent rather than try again on every cue. */
  let broken = false;

  const ready = (): AudioContext | null => {
    if (ctx) return ctx;
    if (broken) return null;
    const AC = typeof window === "undefined"
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    // A browser may refuse an AudioContext (too many open, a locked-down policy). play() runs
    // inside the LED's frames and effects, so a throw here would take the display down: the
    // synth goes silent instead.
    try {
      const c = new AC();
      master = c.createGain();
      master.gain.value = 0.6;
      master.connect(c.destination);
      noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      ctx = c;
      return ctx;
    } catch {
      broken = true;
      master = null;
      noise = null;
      return null;
    }
  };

  const tone = (c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  };

  const hiss = (c: AudioContext, start: number, dur: number, gain: number, filter: BiquadFilterType, freq: number, endFreq?: number) => {
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(master!);
    src.start(start);
    src.stop(start + dur + 0.02);
  };

  return {
    unlock() {
      const c = ready();
      if (c && c.state === "suspended") c.resume().catch(() => {});
    },
    setMuted(m) { muted = m; },
    isMuted: () => muted,
    play(sfx, durationMs = 0) {
      if (muted) return;
      const c = ready();
      if (!c || c.state !== "running") return;
      const t = c.currentTime + 0.01;
      switch (sfx) {
        case "tick": tone(c, 1200, t, 0.05, "square", 0.25); break;
        case "go": [440, 554, 659].forEach((f) => tone(c, f, t, 0.7, "sawtooth", 0.18)); break;
        case "slice": tone(c, 1800, t, 0.02, "triangle", 0.12); break;
        case "clunk": tone(c, 180, t, 0.14, "sine", 0.5); hiss(c, t, 0.08, 0.2, "lowpass", 900); break;
        case "whoosh": hiss(c, t, 0.6, 0.35, "bandpass", 400, 3000); break;
        case "lift": tone(c, 300, t, 0.22, "sine", 0.3, 600); break;
        case "flip": hiss(c, t, 0.09, 0.3, "highpass", 2500); tone(c, 900, t + 0.05, 0.06, "square", 0.15); break;
        case "drumroll": {
          const dur = Math.max(0.3, durationMs / 1000);
          for (let s = 0; s < dur; s += 0.045) hiss(c, t + s, 0.04, 0.12 + 0.25 * (s / dur), "lowpass", 1800);
          break;
        }
        case "fanfare": {
          [523, 659, 784].forEach((f, i) => { tone(c, f, t + i * 0.15, 0.16, "triangle", 0.3); tone(c, f, t + i * 0.15, 0.16, "square", 0.08); });
          [1047, 784, 659].forEach((f) => tone(c, f, t + 0.45, 0.9, "triangle", 0.22));
          break;
        }
      }
    },
  };
}
