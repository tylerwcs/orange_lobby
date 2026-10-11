import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";
import type { NewActivity } from "../../db/activities";
import { categoryValues, type FormReader } from "../form";

// The same two values as the polaroid feature's DEFAULT_PROMPT and MAX_PROMPT (D475), written out
// rather than imported: its client entry also carries its screens (next/font, CSS), which a pure
// settings reader, and the vitest node run that loads it, must not pull in. The settings test
// pins the default.
const DEFAULT_PROMPT = "Share the moment!";
const MAX_PROMPT = 60;

export type PolaroidKindSettings = { name: string; description: string | null; categories: string[] | null; prompt: string };

/** A polaroid wall's add form and its Details card (D420). The wall's own settings save on their own card (D485). */
export function readPolaroidKindSettings(form: FormReader): PolaroidKindSettings {
  const name = form.text("name");
  if (!name) throw new Error("A polaroid wall needs a name");
  const prompt = form.text("prompt") || DEFAULT_PROMPT;
  if (prompt.length > MAX_PROMPT) throw new Error(`Keep the prompt to ${MAX_PROMPT} characters`);
  return { name, description: cleanRichText(form.text("description")), categories: parseCategories(categoryValues(form)), prompt };
}

/** Never owed and never capped (D471). Its two links are minted by the add action. */
export function newPolaroid(settings: PolaroidKindSettings, isOpen: boolean): NewActivity {
  const { prompt, ...details } = settings;
  return { ...details, kind: "polaroid", required: false, is_open: isOpen, max_per_attendee: null, questions: [], per_day: false, polaroid: { prompt } };
}
