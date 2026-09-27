import { z } from "zod";

/**
 * The games an event can run on its LED (D250). Keys may be added but never removed, or
 * stored rows stop parsing — the same rule as `modules`.
 */
export const GAME_KINDS = ["tap_race", "survival", "draw"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAME_KIND_LABELS: Record<GameKind, string> = {
  tap_race: "Tap race",
  survival: "Last one standing",
  draw: "Lucky draw",
};

export const raceConfigSchema = z.object({
  duration_s: z.number().int().min(10).max(60).default(20),
});

const questionSchema = z
  .object({
    text: z.string().trim().min(1).max(200),
    options: z.array(z.string().trim().min(1).max(60)).min(2).max(4),
    correct: z.number().int().min(0),
  })
  .refine((q) => q.correct < q.options.length, { message: "Pick which option is correct.", path: ["correct"] });

export const survivalConfigSchema = z.object({
  answer_s: z.number().int().min(5).max(30).default(10),
  questions: z.array(questionSchema).max(50).default([]),
});

const prizeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(500),
});

export const drawConfigSchema = z.object({
  checkpoint_id: z.string().nullable().default(null),
  exclude_categories: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  prizes: z.array(prizeSchema).max(50).default([]),
});

export type RaceConfig = z.infer<typeof raceConfigSchema>;
export type Question = z.infer<typeof questionSchema>;
export type SurvivalConfig = z.infer<typeof survivalConfigSchema>;
export type Prize = z.infer<typeof prizeSchema>;
export type DrawConfig = z.infer<typeof drawConfigSchema>;

type ConfigFor = { tap_race: RaceConfig; survival: SurvivalConfig; draw: DrawConfig };
const SCHEMAS = { tap_race: raceConfigSchema, survival: survivalConfigSchema, draw: drawConfigSchema };

type GameBase = { id: string; org_id: string; event_id: string; title: string; position: number; created_at: string };
export type RaceGame = GameBase & { kind: "tap_race"; config: RaceConfig };
export type SurvivalGame = GameBase & { kind: "survival"; config: SurvivalConfig };
export type DrawGame = GameBase & { kind: "draw"; config: DrawConfig };
export type Game = RaceGame | SurvivalGame | DrawGame;

export function isGameKind(v: unknown): v is GameKind {
  return typeof v === "string" && (GAME_KINDS as readonly string[]).includes(v);
}

/** The config a new game of this kind starts with. */
export function defaultConfig<K extends GameKind>(kind: K): ConfigFor[K] {
  return SCHEMAS[kind].parse({}) as ConfigFor[K];
}

/** The stored config, validated; null when it no longer parses. */
export function parseConfig<K extends GameKind>(kind: K, raw: unknown): ConfigFor[K] | null {
  const r = SCHEMAS[kind].safeParse(raw ?? {});
  return r.success ? (r.data as ConfigFor[K]) : null;
}

/**
 * A `games` row as the app uses it. A row whose kind or config no longer parses is dropped
 * rather than thrown: one bad game must not take the Games page down on event day.
 */
export function hydrateGame(row: unknown): Game | null {
  const r = row as (GameBase & { kind: unknown; config: unknown }) | null;
  if (!r || !isGameKind(r.kind)) return null;
  const config = parseConfig(r.kind, r.config);
  if (!config) return null;
  return {
    id: r.id, org_id: r.org_id, event_id: r.event_id, title: r.title, position: r.position,
    created_at: r.created_at, kind: r.kind, config,
  } as Game;
}

/** One line for the admin list row and the host's game picker. */
export function gameSummary(g: Game): string {
  if (g.kind === "tap_race") return `${g.config.duration_s} s race`;
  if (g.kind === "survival") {
    const n = g.config.questions.length;
    return `${n} question${n === 1 ? "" : "s"} · ${g.config.answer_s} s each`;
  }
  const n = g.config.prizes.length;
  const total = g.config.prizes.reduce((sum, p) => sum + p.quantity, 0);
  return `${n} prize${n === 1 ? "" : "s"} · ${total} to give`;
}
