import { z } from "zod";

/** D884: the bounds an organiser's test lives within. Four answers because the page holds four rows (D872). */
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 12;
export const ANSWERS = 4;
export const MIN_PERSONALITIES = 2;
export const MAX_PERSONALITIES = 8;
export const TRAITS = 6;
export const TICKED = 3;
export const MAX_HOLDER_NAME = 40;

/** The intro spread before question 1: its heading (top page) and one line (bottom page), the travel set's own. */
export const DEFAULT_INTRO = { heading: "Which traveller are you?", line: "Answer a few quick questions and find out." } as const;
export const MAX_INTRO_HEADING = 40;
export const MAX_INTRO_LINE = 120;

/** D876: the holder page's three section labels, the travel set's own. */
export const DEFAULT_LABELS: [string, string, string] = ["KEY TRAITS", "TRAVEL STYLE", "LIKELY TO SAY"];

const HEX = /^#[0-9a-f]{6}$/i;
const id = (prefix: "q" | "a" | "p") => z.string().regex(new RegExp(`^${prefix}-[0-9a-f]{8}$`));
/** Stored images are ours (https, the event-media bucket); the travel set's characters ship in /public. */
const picture = z.union([z.url({ protocol: /^https$/ }), z.string().regex(/^\/passport\/characters\/[a-z-]+\.svg$/)]).nullable().catch(null);
/** Clipped, never rejected: one over-long value must not blank itself or its neighbours on read. */
const clipped = (max: number) => (s: string) => Array.from(s.replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
const text = (max: number) => z.string().catch("").transform(clipped(max));

/** Keeps the items that parse and drops the rest, so one damaged entry never blanks a list. */
function listOf<T extends z.ZodType>(item: T) {
  return z.array(z.unknown()).catch([]).transform((items) => items.flatMap((i) => {
    const r = item.safeParse(i);
    return r.success ? [r.data as z.infer<T>] : [];
  }));
}

const answer = z.object({
  id: id("a"),
  text: text(80),
  icon: z.string().transform(clipped(16)).nullable().catch(null).transform((s) => s || null),
  personality: z.string().catch(""),
});

const question = z.object({
  id: id("q"),
  scene: text(40),
  text: text(120),
  image: picture,
  answers: listOf(answer),
});

const personality = z.object({
  id: id("p"),
  name: text(40),
  colour: z.string().regex(HEX).catch("#3E7BD9"),
  picture,
  traits: z.array(z.string().catch("").transform(clipped(24))).catch([]),
  ticked: z.array(z.number().int().min(0)).catch([]),
  style: text(60),
  say: z.tuple([text(40), text(40)]).catch(["", ""]),
  blurb: text(120),
});

const schema = z.object({
  on: z.boolean().catch(false),
  questions: listOf(question),
  personalities: listOf(personality),
  labels: z.tuple([text(24), text(24), text(24)]).catch(DEFAULT_LABELS),
  // Blank (or missing, on a test saved before the intro) is the travel set's wording.
  intro: z.object({ heading: text(MAX_INTRO_HEADING), line: text(MAX_INTRO_LINE) }).catch({ heading: "", line: "" })
    .transform((i) => ({ heading: i.heading || DEFAULT_INTRO.heading, line: i.line || DEFAULT_INTRO.line })),
  cover: z.object({
    colour: z.string().regex(HEX).nullable().catch(null),
    crest: z.url({ protocol: /^https$/ }).nullable().catch(null),
  }).catch({ colour: null, crest: null }),
});

export type TestAnswer = z.infer<typeof answer>;
export type TestQuestion = z.infer<typeof question>;
export type Personality = z.infer<typeof personality>;
export type PassportTest = z.infer<typeof schema>;

/**
 * An activity's `passport_test` column with every default filled in (D884). Never throws: each
 * field falls back on its own and damaged list items are dropped, as `readPolaroidSettings`.
 */
export function readPassportTest(raw: unknown): PassportTest {
  return schema.parse(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
}

/** A stable id for a question, answer or personality, so an edit never re-maps a guest's result. */
export function newTestId(prefix: "q" | "a" | "p"): string {
  return `${prefix}-${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}
