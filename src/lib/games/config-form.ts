import type { z } from "zod";
import { drawConfigSchema, raceConfigSchema, survivalConfigSchema, type GameKind } from "@/lib/games/config";

type Form = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };
export type ConfigResult = { ok: true; config: unknown } | { ok: false; error: string };

/** What the questions editor holds: always four option boxes, some of them blank. */
export type QuestionDraft = { text: string; options: string[]; correct: number };

/**
 * The editor's drafts as the config stores them: blank options dropped, and the correct index
 * moved to match. A correct option left blank becomes -1, which the schema refuses with a
 * message naming the question — better than silently marking a different option correct.
 */
export function packQuestions(drafts: QuestionDraft[]): { text: string; options: string[]; correct: number }[] {
  return drafts.map((d) => {
    const kept: string[] = [];
    let correct = -1;
    d.options.forEach((o, i) => {
      if (!o.trim()) return;
      if (i === d.correct) correct = kept.length;
      kept.push(o);
    });
    return { text: d.text, options: kept, correct };
  });
}

const int = (v: FormDataEntryValue | null) => Number.parseInt(String(v ?? ""), 10);

function json(v: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(v ?? "[]"));
  } catch {
    return undefined;
  }
}

function explain(error: z.ZodError): string {
  const path = error.issues[0]?.path ?? [];
  const [field, index, part] = path;
  if (field === "duration_s") return "A race runs for 10 to 60 seconds.";
  if (field === "answer_s") return "Answer time is 5 to 30 seconds.";
  if (field === "questions" && typeof index === "number") {
    const n = index + 1;
    if (part === "correct") return `Question ${n}: pick which option is correct.`;
    if (part === "options") return `Question ${n} needs 2 to 4 options.`;
    if (part === "text") return `Question ${n} needs its question.`;
  }
  if (field === "questions") return "Up to 50 questions.";
  if (field === "prizes" && typeof index === "number") return `Prize ${index + 1} needs a name and a quantity from 1 to 500.`;
  if (field === "prizes") return "Up to 50 prizes.";
  return "Something on the form is not right. Check it and save again.";
}

/** The Games editor's form, validated for its kind (D287). */
export function configFromForm(kind: GameKind, form: Form): ConfigResult {
  if (kind === "tap_race") {
    const r = raceConfigSchema.safeParse({ duration_s: int(form.get("duration_s")) });
    return r.success ? { ok: true, config: r.data } : { ok: false, error: explain(r.error) };
  }
  if (kind === "survival") {
    const questions = json(form.get("questions"));
    if (!Array.isArray(questions)) return { ok: false, error: "The questions could not be read. Reload the page and try again." };
    const r = survivalConfigSchema.safeParse({ answer_s: int(form.get("answer_s")), questions });
    return r.success ? { ok: true, config: r.data } : { ok: false, error: explain(r.error) };
  }
  const prizes = json(form.get("prizes"));
  if (!Array.isArray(prizes)) return { ok: false, error: "The prizes could not be read. Reload the page and try again." };
  const r = drawConfigSchema.safeParse({
    checkpoint_id: String(form.get("checkpoint_id") ?? "") || null,
    exclude_categories: form.getAll("exclude").map(String),
    prizes,
  });
  return r.success ? { ok: true, config: r.data } : { ok: false, error: explain(r.error) };
}
