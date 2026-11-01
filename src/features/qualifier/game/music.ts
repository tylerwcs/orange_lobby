// The slime game's background music (D794): a short looping tune written as data, played by
// sound.ts with WebAudio (no audio files). Pure, so the score is tested without a browser.
//
// Four bars of sixteenth-note steps, looped. Three moods:
// - "title": the tune softly, no drums (the title screen);
// - "play": bouncy, I-vi-IV-V in C major with a melody, bass and drums (a normal run);
// - "boss": faster and tense, i-VI-iv-V in A minor, driving bass and hats, no melody (a boss is out).

export type Mood = "title" | "play" | "boss";
export type Voice = "bass" | "arp" | "lead" | "kick" | "snare" | "hat";
/** One note: `midi` pitch (drums have none), `len` in steps. */
export type Note = { voice: Voice; midi?: number; len: number };

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const BPM: Record<Mood, number> = { title: 96, play: 116, boss: 138 };

/** Seconds per sixteenth-note step. */
export const stepSeconds = (mood: Mood): number => 60 / BPM[mood] / 4;

/** Each bar's chord: its root (MIDI, bass octave) and whether it is minor. */
const CHORDS: Record<"major" | "minor", { root: number; minor: boolean }[]> = {
  // C, Am, F, G
  major: [{ root: 48, minor: false }, { root: 45, minor: true }, { root: 41, minor: false }, { root: 43, minor: false }],
  // Am, F, Dm, E (major: the pull back home)
  minor: [{ root: 45, minor: true }, { root: 41, minor: false }, { root: 38, minor: true }, { root: 40, minor: false }],
};

/** The "play" melody: [step, MIDI, len] per bar, in C major (C5 = 72). */
const MELODY: [number, number, number][][] = [
  [[0, 76, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
  [[0, 72, 2], [2, 76, 2], [4, 81, 4], [8, 79, 2], [10, 76, 2], [12, 72, 4]],
  [[0, 81, 2], [2, 79, 2], [4, 77, 2], [6, 81, 2], [8, 84, 4], [12, 81, 4]],
  [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 71, 2], [14, 74, 2]],
];

const triad = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7];

/** What plays at global step `step` (0, 1, 2... looping every BARS bars) in `mood`. */
export function scoreAt(mood: Mood, step: number): Note[] {
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
  const s = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  const chord = CHORDS[mood === "boss" ? "minor" : "major"][bar];
  const [r, third, fifth] = triad(chord.root, chord.minor);
  const notes: Note[] = [];

  if (mood === "boss") {
    // Driving eighth-note bass with octave jumps; sixteenth arpeggio; four-on-the-floor.
    if (s % 2 === 0) notes.push({ voice: "bass", midi: s === 6 || s === 14 ? r + 12 : r, len: 2 });
    const arp = [r + 24, third + 24, fifth + 24, third + 24];
    notes.push({ voice: "arp", midi: arp[s % 4], len: 1 });
    if (s % 4 === 0) notes.push({ voice: "kick", len: 1 });
    if (s === 4 || s === 12) notes.push({ voice: "snare", len: 1 });
    notes.push({ voice: "hat", len: 1 });
    return notes;
  }

  // Bass: root, root, fifth, octave.
  if (s === 0 || s === 6) notes.push({ voice: "bass", midi: r, len: 2 });
  if (s === 8) notes.push({ voice: "bass", midi: r + 7, len: 2 });
  if (s === 12) notes.push({ voice: "bass", midi: r + 12, len: 2 });
  // Arpeggio up the chord, an octave and two above the bass.
  const arp = [r + 24, third + 24, fifth + 24, r + 36];
  if (mood === "title" ? s % 4 === 0 : s % 2 === 0) notes.push({ voice: "arp", midi: arp[(s / (mood === "title" ? 4 : 2)) % 4], len: 1 });
  for (const [at, midi, len] of MELODY[bar]) if (at === s) notes.push({ voice: "lead", midi, len });
  if (mood === "play") {
    if (s === 0 || s === 8) notes.push({ voice: "kick", len: 1 });
    if (s === 4 || s === 12) notes.push({ voice: "snare", len: 1 });
    if (s % 4 === 2) notes.push({ voice: "hat", len: 1 });
  }
  return notes;
}

/** A MIDI note's frequency, Hz (A4 = 69 = 440 Hz). */
export const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
