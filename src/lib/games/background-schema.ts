import { z } from "zod";
import { BACKGROUND_KINDS, DEFAULT_BACKGROUND, type Background, type BackgroundKind } from "@/lib/games/background";

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
