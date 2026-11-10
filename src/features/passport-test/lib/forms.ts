import { ANSWERS, DEFAULT_LABELS, TICKED, TRAITS, newTestId, type Personality, type TestQuestion } from "./settings";

/** A posted field, "" when it is absent. */
type Get = (name: string) => string;
/** Whether a field was posted at all (a ticked box). */
type Has = (name: string) => boolean;

const clip = (s: string, max: number) => Array.from(s.replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * D884: one question's modal - its scene, question, and four answers, each with words, an
 * optional icon and the personality it points to. Ids are kept on an edit, so a guest's saved
 * answers keep meaning the same thing. A picker locked by D887 posts nothing, so the answer keeps
 * the personality it had. The picture is read by the action (it is an upload). Throws the
 * sentence the organiser reads.
 */
export function readQuestionForm(get: Get, current: TestQuestion | null, personalities: Personality[]): TestQuestion {
  const text = clip(get("text"), 120);
  if (!text) throw new Error("A question needs its question.");
  const known = new Set(personalities.map((p) => p.id));
  const answers = Array.from({ length: ANSWERS }, (_, j) => {
    const words = clip(get(`answer_${j}`), 80);
    if (!words) throw new Error(`A question needs ${ANSWERS} answers, each with words.`);
    const personality = get(`who_${j}`) || current?.answers[j]?.personality || "";
    if (!known.has(personality)) throw new Error("Each answer needs a personality to point to.");
    return { id: current?.answers[j]?.id ?? newTestId("a"), text: words, icon: clip(get(`icon_${j}`), 16) || null, personality };
  });
  return { id: current?.id ?? newTestId("q"), scene: clip(get("scene"), 40), text, image: current?.image ?? null, answers };
}

/** D884, D876: one personality's modal. Its picture is read by the action (an upload). */
export function readPersonalityForm(get: Get, has: Has, current: Personality | null): Personality {
  const name = clip(get("name"), 40);
  if (!name) throw new Error("A personality needs a name.");
  const colour = get("colour").trim();
  if (!HEX.test(colour)) throw new Error("Pick a colour for this personality.");
  const traits = Array.from({ length: TRAITS }, (_, j) => clip(get(`trait_${j}`), 24));
  if (traits.some((x) => !x)) throw new Error(`A personality needs ${TRAITS} traits.`);
  const ticked = traits.map((_, j) => j).filter((j) => has(`tick_${j}`));
  if (ticked.length !== TICKED) throw new Error(`Tick exactly ${TICKED} of the traits.`);
  return {
    id: current?.id ?? newTestId("p"), name, colour: colour.toUpperCase(), picture: current?.picture ?? null,
    traits, ticked, style: clip(get("style"), 60), say: [clip(get("say_0"), 40), clip(get("say_1"), 40)], blurb: clip(get("blurb"), 120),
  };
}

/** D876, D885: the holder page's three labels (blank is the travel set's) and the cover's colour (null follows the event). */
export function readLookForm(get: Get, has: Has): { labels: [string, string, string]; colour: string | null } {
  const labels = DEFAULT_LABELS.map((d, i) => clip(get(`label_${i}`), 24) || d) as [string, string, string];
  const colour = get("cover_colour").trim();
  return { labels, colour: has("cover_theme") || !HEX.test(colour) ? null : colour.toUpperCase() };
}
