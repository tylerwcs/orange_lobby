import { z } from "zod";

/** What the LED shows behind a game (D297). */
export const BACKGROUND_KINDS = ["theme", "green", "image", "video"] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];
export type Background = { kind: BackgroundKind; url: string | null };

export const DEFAULT_BACKGROUND: Background = { kind: "theme", url: null };

/** Broadcast chroma green, for the AV team to key out (D299). */
export const CHROMA_GREEN = "#00B140";

const needsUrl = (k: BackgroundKind) => k === "image" || k === "video";

/**
 * Read tolerantly (D297): a stored background that no longer parses — or an image or video with
 * no file — reads as Theme, so one bad value can never take a game off the LED on the day.
 */
export const backgroundSchema = z
  .object({ kind: z.enum(BACKGROUND_KINDS), url: z.url().max(2000).nullable() })
  .transform((b): Background => {
    if (!needsUrl(b.kind)) return { kind: b.kind, url: null };
    return b.url ? { kind: b.kind, url: b.url } : DEFAULT_BACKGROUND;
  })
  .catch(DEFAULT_BACKGROUND);

/** The background of the game on stage; Theme when nothing is on (the idle screen, D298). */
export function backgroundOf(game: { config: { background?: Background } } | null): Background {
  return game?.config.background ?? DEFAULT_BACKGROUND;
}

const CONFETTI = ["#F97316", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"];

/** Confetti colours; no green in green mode, or the pieces would be keyed out (D299). */
export function confettiColours(green: boolean): string[] {
  return green ? CONFETTI.filter((c) => c !== "#22C55E") : CONFETTI;
}

export type BackgroundResult = { ok: true; background: Background } | { ok: false; error: string };

/**
 * The background the game editor saves (D300). `image` is the image URL after the save's upload
 * (a new upload, or the one already stored); `video` is the URL the browser uploaded a video to,
 * accepted only when `ours` says it is in our bucket.
 */
export function backgroundFromForm(kind: string, input: { image: string | null; video: string | null; ours: (url: string) => boolean }): BackgroundResult {
  if (kind === "theme" || kind === "green") return { ok: true, background: { kind, url: null } };
  if (kind === "image") {
    return input.image ? { ok: true, background: { kind, url: input.image } } : { ok: false, error: "Choose a background image, or pick another background." };
  }
  if (kind === "video") {
    if (!input.video) return { ok: false, error: "Upload a background video, or pick another background." };
    return input.ours(input.video) ? { ok: true, background: { kind, url: input.video } } : { ok: false, error: "That video was not uploaded here. Upload it again." };
  }
  return { ok: false, error: "Pick a background." };
}
