// The slime run's sound (D794): short effects and a looping background tune (music.ts), all
// synthesised with WebAudio, no asset files. Effects and music each have their own level, under
// one master that the mute silences at once. Muting is remembered on the device. Every call is
// best effort: no AudioContext, a suspended one or blocked storage means silence, never an error.
import { hz, scoreAt, stepSeconds, STEPS_PER_BAR, type Mood, type Note } from "./music";

export type Sfx =
  | "pop" | "splat" | "hit" | "boss" | "wrong" | "bite"
  | "type" | "combo" | "count" | "go" | "bossDown" | "timeup" | "win";

const MUTE_KEY = "qualifier-muted";
/** Effects' loudness: they sit under whatever else the phone is playing. */
const VOLUME = 0.35;
/** The music's, well under the effects. */
const MUSIC_VOLUME = 0.13;
/** The music is scheduled this far ahead (s), topped up every MUSIC_TICK_MS. */
const LOOKAHEAD = 0.15;
const MUSIC_TICK_MS = 25;

let muted: boolean | null = null;
let ctx: AudioContext | null = null;
/** Master (the mute), and the effects' and the music's levels into it. */
let master: GainNode | null = null;
let out: GainNode | null = null;
let musicOut: GainNode | null = null;
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
  // Silence what is already scheduled too (the music's next notes, an effect's tail).
  if (ctx && master) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.02);
}

/** The shared context, created on first use; null where WebAudio isn't available. */
function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(ctx.destination);
    out = ctx.createGain();
    out.gain.value = VOLUME;
    out.connect(master);
    musicOut = ctx.createGain();
    musicOut.gain.value = MUSIC_VOLUME;
    musicOut.connect(master);
  } catch {
    ctx = null;
    master = out = musicOut = null;
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

/** Notes one after another, `gap` s apart: a jingle. */
function jingle(c: AudioContext, dest: AudioNode, at: number, type: OscillatorType, midis: number[], gap: number, dur: number, peak: number) {
  midis.forEach((m, i) => tone(c, dest, at + i * gap, type, hz(m), hz(m), i === midis.length - 1 ? dur * 2 : dur, peak));
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
      case "bite": // a slime latches on: a chomp, then a two-beep alarm
        burst(c, out, at, 1200, 0.07, 0.4);
        tone(c, out, at + 0.08, "square", 880, 880, 0.09, 0.14);
        tone(c, out, at + 0.22, "square", 880, 880, 0.09, 0.14);
        break;
      case "type": { // a right letter: a soft tick, a little different each time
        const f = 1150 + Math.random() * 250;
        tone(c, out, at, "sine", f, f * 1.15, 0.045, 0.12);
        break;
      }
      case "combo": // the multiplier goes up: a quick sparkle up the scale
        jingle(c, out, at, "triangle", [84, 88, 91, 96], 0.05, 0.09, 0.22);
        break;
      case "count": // 3, 2, 1
        tone(c, out, at, "square", 660, 660, 0.13, 0.16);
        break;
      case "go": // go!
        tone(c, out, at, "square", 990, 1320, 0.3, 0.2);
        tone(c, out, at, "triangle", 495, 660, 0.3, 0.2);
        break;
      case "bossDown": // a boss is gone: a little fanfare, after its splat
        jingle(c, out, at + 0.25, "triangle", [72, 76, 79, 84], 0.11, 0.14, 0.32);
        jingle(c, out, at + 0.25, "square", [60, 64, 67, 72], 0.11, 0.14, 0.08);
        break;
      case "timeup": // the clock ran out: a buzzer, then three falling notes
        tone(c, out, at, "square", 220, 220, 0.5, 0.18);
        jingle(c, out, at + 0.55, "triangle", [67, 64, 60], 0.22, 0.25, 0.3);
        break;
      case "win": // the last boss popped: a fanfare up to a held top note, after its splat
        jingle(c, out, at + 0.25, "triangle", [72, 76, 79, 84, 88, 91], 0.1, 0.13, 0.32);
        jingle(c, out, at + 0.25, "square", [60, 64, 67, 72, 76, 79], 0.1, 0.13, 0.08);
        tone(c, out, at + 0.85, "triangle", hz(96), hz(96), 0.8, 0.3);
        break;
    }
  } catch {
    // A sound that can't play is skipped.
  }
}

// ---- The background music: music.ts's score, scheduled a little ahead on the audio clock. ----

let musicTimer: ReturnType<typeof setInterval> | null = null;
let mood: Mood = "title";
/** A mood asked for while playing: it starts at the next bar, so the tune never breaks mid-bar. */
let nextMood: Mood | null = null;
let step = 0;
let stepAt = 0;

function playNote(c: AudioContext, dest: AudioNode, n: Note, at: number, stepS: number) {
  const f = n.midi === undefined ? 0 : hz(n.midi);
  switch (n.voice) {
    case "bass":
      tone(c, dest, at, "triangle", f, f, n.len * stepS * 0.9, 0.55);
      break;
    case "arp":
      tone(c, dest, at, "square", f, f, Math.min(0.12, stepS * 0.9), 0.1);
      break;
    case "lead":
      tone(c, dest, at, "triangle", f, f, n.len * stepS * 0.95, 0.32);
      tone(c, dest, at, "sine", f * 2, f * 2, n.len * stepS * 0.5, 0.06);
      break;
    case "kick":
      tone(c, dest, at, "sine", 150, 45, 0.16, 0.8);
      break;
    case "snare":
      burst(c, dest, at, 5000, 0.12, 0.3);
      break;
    case "hat":
      burst(c, dest, at, 11000, 0.035, 0.12);
      break;
  }
}

function scheduleMusic() {
  const c = ctx;
  if (!c || !musicOut) return;
  // A throttled timer (a hidden tab) fell behind: pick up from now, not with a pile of old notes.
  if (stepAt < c.currentTime - 0.05) stepAt = c.currentTime + 0.05;
  while (stepAt < c.currentTime + LOOKAHEAD) {
    if (nextMood && step % STEPS_PER_BAR === 0) {
      mood = nextMood;
      nextMood = null;
    }
    const stepS = stepSeconds(mood);
    if (!isMuted()) {
      try {
        for (const n of scoreAt(mood, step)) playNote(c, musicOut, n, stepAt, stepS);
      } catch {
        // A note that can't play is skipped.
      }
    }
    stepAt += stepS;
    step += 1;
  }
}

/**
 * Plays the background music in `m` (starting it if it isn't playing). A change of mood takes
 * over at the next bar. Call `primeSound` from a gesture first, or the browser keeps it silent.
 */
export function playMusic(m: Mood): void {
  const c = audio();
  if (!c || !musicOut) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  if (musicTimer !== null) {
    if (m !== mood) nextMood = m;
    else nextMood = null;
    return;
  }
  mood = m;
  nextMood = null;
  step = 0;
  stepAt = c.currentTime + 0.08;
  musicOut.gain.cancelScheduledValues(c.currentTime);
  musicOut.gain.setValueAtTime(MUSIC_VOLUME, c.currentTime);
  scheduleMusic();
  musicTimer = setInterval(scheduleMusic, MUSIC_TICK_MS);
}

/** Stops the music, fading out what is already scheduled. */
export function stopMusic(): void {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
  nextMood = null;
  if (ctx && musicOut) {
    musicOut.gain.cancelScheduledValues(ctx.currentTime);
    musicOut.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }
}
