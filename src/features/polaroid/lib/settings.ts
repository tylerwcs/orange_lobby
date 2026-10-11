import { z } from "zod";

/** How fast the wall's columns move (D484). */
export const WALL_SPEEDS = ["slow", "medium", "fast"] as const;
export type WallSpeed = (typeof WALL_SPEEDS)[number];

export const DEFAULT_PROMPT = "Share the moment!";
export const MAX_PROMPT = 60;
const MAX_BLOCKED_WORDS = 200;
const MAX_WORD = 40;
const MAX_EVENT_STICKERS = 40;

const eventSticker = z.object({ id: z.string().regex(/^ev-[a-z0-9]{8}$/), url: z.url(), name: z.string().min(1).max(60) });
const background = z.object({ type: z.enum(["image", "video"]), url: z.url() });

const schema = z.object({
  prompt: z.string().trim().min(1).max(MAX_PROMPT).catch(DEFAULT_PROMPT),
  public: z.boolean().catch(false),
  hidden_builtin: z.array(z.string()).catch([]),
  stickers: z.array(eventSticker).max(MAX_EVENT_STICKERS).catch([]),
  blocked_words: z.array(z.string().min(1).max(MAX_WORD)).max(MAX_BLOCKED_WORDS).catch([]),
  columns: z.union([z.literal("auto"), z.number().int().min(3).max(10)]).catch("auto"),
  speed: z.enum(WALL_SPEEDS).catch("medium"),
  background: background.nullable().catch(null),
});

export type PolaroidSettings = z.infer<typeof schema>;
export type EventSticker = z.infer<typeof eventSticker>;
export type WallBackground = z.infer<typeof background>;

/**
 * An activity's `polaroid` column with every default filled in (D475). Never throws: each field
 * falls back on its own, so one damaged value never blanks the rest of the wall's settings.
 */
export function readPolaroidSettings(raw: unknown): PolaroidSettings {
  return schema.parse(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
}

/** The admin's blocked-words box: one per line or comma, lowercased, deduped, at most 200. */
export function parseBlockedWords(text: string): string[] {
  const words = text.split(/[\n,]/).map((w) => w.trim().toLowerCase().replace(/\s+/g, " ")).filter((w) => w && w.length <= MAX_WORD);
  return [...new Set(words)].slice(0, MAX_BLOCKED_WORDS);
}

export function parseColumns(v: string): "auto" | number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 3 && n <= 10 ? n : "auto";
}

export function parseSpeed(v: string): WallSpeed {
  return (WALL_SPEEDS as readonly string[]).includes(v) ? (v as WallSpeed) : "medium";
}
