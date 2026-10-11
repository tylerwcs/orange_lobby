import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

export const MAX_MESSAGE = 80;
export const FRIENDLY_REJECTION = "Let's keep it friendly — please change the wording.";
export const MESSAGE_TOO_LONG = `Keep your message to ${MAX_MESSAGE} characters.`;

/**
 * D479: common Malay, Manglish and Malaysian Hokkien/Cantonese/Tamil-origin swear words and
 * insults. `obscenity` knows only English. Admins add their own per event (`blocked_words`).
 */
export const MALAY_BLOCKED: readonly string[] = [
  "babi", "bangsat", "bodoh", "sial", "celaka", "puki", "pukimak", "kimak", "lancau", "pantat",
  "butoh", "konek", "jubur", "haram jadah", "sundal", "pelacur", "keparat", "pepek", "cibai",
  "kanina", "knn", "nabei", "lanjiao", "pundek", "bapak kau", "mak kau",
];

/** Particles Malaysians tack onto a word, so "babilah" is still caught. */
const SUFFIXES = ["", "la", "lah", "nya", "kau", "ke"];

const english = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const LEET: Record<string, string> = { "4": "a", "@": "a", "3": "e", "1": "i", "0": "o", "5": "s", "$": "s", "7": "t" };

/** Characters as people count them: an emoji is one, not two UTF-16 units. */
export function messageLength(text: string): number {
  return [...text].length;
}

/**
 * Text reduced to plain lowercase words: accents stripped, leetspeak undone, anything else a
 * space, and runs of one letter squeezed to one ("babiii" is "babi").
 */
export function normaliseForMatch(text: string): string {
  return text
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "!" reads as "i" only between letters or digits, so a trailing "!" becomes a space.
    .replace(/(?<=[a-z0-9@$])!(?=[a-z0-9@$])/g, "i")
    .replace(/[4@3105$7]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]+/g, " ")
    .replace(/([a-z])\1+/g, "$1")
    .trim();
}

/** Whether `text` holds any of `words` as a whole word (or phrase), allowing a Malay particle after it. */
export function hasBlockedWord(text: string, words: readonly string[]): boolean {
  const hay = normaliseForMatch(text);
  if (!hay) return false;
  const tokens = hay.split(" ");
  const spaced = ` ${hay} `;
  return words.some((w) => {
    const n = normaliseForMatch(w);
    if (!n) return false;
    if (n.includes(" ")) return spaced.includes(` ${n} `);
    return tokens.some((t) => SUFFIXES.some((s) => t === n + s));
  });
}

export type MessageCheck = { ok: true; message: string } | { ok: false; error: string };

/** D479: the server's check on every post; the composer runs the same one for instant feedback. */
export function checkMessage(raw: string, extraWords: readonly string[] = []): MessageCheck {
  const message = raw.replace(/\s+/g, " ").trim();
  if (messageLength(message) > MAX_MESSAGE) return { ok: false, error: MESSAGE_TOO_LONG };
  if (!message) return { ok: true, message };
  if (english.hasMatch(message) || hasBlockedWord(message, MALAY_BLOCKED) || hasBlockedWord(message, extraWords)) {
    return { ok: false, error: FRIENDLY_REJECTION };
  }
  return { ok: true, message };
}
