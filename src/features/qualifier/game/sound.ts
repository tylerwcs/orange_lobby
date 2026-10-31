// The slime run's sound effects (D794): a few short sounds synthesised with WebAudio, no asset
// files and no music. Muting is remembered on the device. Every call is best effort: no
// AudioContext, a suspended one or blocked storage means silence, never an error.

export type Sfx = "pop" | "splat" | "hit" | "boss" | "wrong";

const MUTE_KEY = "qualifier-muted";
/** Overall loudness: effects sit under whatever else the phone is playing. */
const VOLUME = 0.35;

let muted: boolean | null = null;
let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(on: boolean): void {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {
    // Remembered for this page only.
  }
}

/** The shared context, created on first use; null where WebAudio isn't available. */
function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    out = ctx.createGain();
    out.gain.value = VOLUME;
    out.connect(ctx.destination);
  } catch {
    ctx = null;
    out = null;
  }
  return ctx;
}

/**
 * Create (or wake) the audio context. Call it from a tap or a key press: browsers only let a page
 * start sound inside a user gesture, and the effects themselves play from the frame loop.
 */
export function primeSound(): void {
  const c = audio();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

/** One tone: `type` wave from `f0` to `f1` Hz over `dur` s, with a quick attack and a decay. */
function tone(c: AudioContext, dest: AudioNode, at: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A burst of filtered noise: the wet part of a splat. */
function burst(c: AudioContext, dest: AudioNode, at: number, cutoff: number, dur: number, peak: number) {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff / 6), at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(dest);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** Play one effect now, unless muted. Never throws. */
export function sfx(kind: Sfx): void {
  if (isMuted()) return;
  const c = audio();
  if (!c || !out) return;
  try {
    if (c.state === "suspended") c.resume().catch(() => {});
    const at = c.currentTime + 0.005;
    switch (kind) {
      case "pop": // a bright blip upwards: a slime bursts
        tone(c, out, at, "sine", 420, 1100, 0.12, 0.6);
        burst(c, out, at, 3000, 0.08, 0.15);
        break;
      case "splat": // a boss bursts: a deep wet splat with a sparkle on top
        tone(c, out, at, "triangle", 220, 55, 0.4, 0.8);
        burst(c, out, at, 1800, 0.45, 0.5);
        tone(c, out, at + 0.05, "sine", 900, 1800, 0.18, 0.25);
        break;
      case "hit": // a slime explodes on the player: a dull thud and goo
        tone(c, out, at, "sine", 140, 40, 0.35, 0.9);
        burst(c, out, at, 900, 0.3, 0.45);
        break;
      case "boss": // a boss arrives: a low two-note horn
        tone(c, out, at, "sawtooth", 98, 92, 0.35, 0.25);
        tone(c, out, at + 0.3, "sawtooth", 73, 69, 0.5, 0.3);
        break;
      case "wrong": // a short low buzz
        tone(c, out, at, "square", 150, 120, 0.09, 0.12);
        break;
    }
  } catch {
    // A sound that can't play is skipped.
  }
}
