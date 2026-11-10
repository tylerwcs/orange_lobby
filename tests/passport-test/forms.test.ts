import { describe, expect, it } from "vitest";
import { DEFAULT_LABELS, readLookForm, readPersonalityForm, readQuestionForm, travelSet } from "@/features/passport-test/client";

const form = (values: Record<string, string>) => ({
  get: (n: string) => values[n] ?? "",
  has: (n: string) => n in values,
});

const t = travelSet();
const [A, B, C, D] = t.personalities.map((p) => p.id);

describe("readQuestionForm", () => {
  const filled = {
    scene: " Boarding ", text: " Which seat? ",
    answer_0: "Window", icon_0: "🪟", who_0: A,
    answer_1: "Aisle", icon_1: "", who_1: B,
    answer_2: "Exit row", icon_2: "", who_2: C,
    answer_3: "Snacks", icon_3: "🥨", who_3: D,
  };

  it("reads a new question with fresh answer ids", () => {
    const f = form(filled);
    const q = readQuestionForm(f.get, null, t.personalities);
    expect(q.id).toMatch(/^q-[0-9a-f]{8}$/);
    expect([q.scene, q.text]).toEqual(["Boarding", "Which seat?"]);
    expect(q.answers.map((a) => [a.text, a.icon, a.personality])).toEqual([["Window", "🪟", A], ["Aisle", null, B], ["Exit row", null, C], ["Snacks", "🥨", D]]);
    expect(q.answers.every((a) => /^a-[0-9a-f]{8}$/.test(a.id))).toBe(true);
  });

  it("keeps an edited question's ids and picture", () => {
    const current = { ...t.questions[0], image: "https://x.test/a.webp" };
    const q = readQuestionForm(form(filled).get, current, t.personalities);
    expect(q.id).toBe(current.id);
    expect(q.answers.map((a) => a.id)).toEqual(current.answers.map((a) => a.id));
    expect(q.image).toBe("https://x.test/a.webp");
  });

  it("keeps an answer's personality when its locked picker posts nothing", () => {
    const current = t.questions[0];
    const q = readQuestionForm(form({ ...filled, who_0: "", who_1: "", who_2: "", who_3: "" }).get, current, t.personalities);
    expect(q.answers.map((a) => a.personality)).toEqual(current.answers.map((a) => a.personality));
  });

  it("refuses a question without its question", () => {
    expect(() => readQuestionForm(form({ ...filled, text: " " }).get, null, t.personalities)).toThrow(/question/i);
  });

  it("refuses a blank answer", () => {
    expect(() => readQuestionForm(form({ ...filled, answer_2: "" }).get, null, t.personalities)).toThrow(/4 answers/);
  });

  it("refuses an answer without a personality it can point to", () => {
    expect(() => readQuestionForm(form({ ...filled, who_1: "p-deadbeef" }).get, null, t.personalities)).toThrow(/personality/i);
  });
});

describe("readPersonalityForm", () => {
  const filled = {
    name: " Pathfinder ", colour: "#3E7BD9",
    trait_0: "Bold", trait_1: "Calm", trait_2: "Kind", trait_3: "Loud", trait_4: "Tidy", trait_5: "Wild",
    tick_0: "on", tick_2: "on", tick_5: "on",
    style: "Aisle seat", say_0: "“Let's", say_1: "go.”", blurb: "Always ahead.",
  };

  it("reads a new personality", () => {
    const p = readPersonalityForm(form(filled).get, form(filled).has, null);
    expect(p.id).toMatch(/^p-[0-9a-f]{8}$/);
    expect(p).toMatchObject({ name: "Pathfinder", colour: "#3E7BD9", ticked: [0, 2, 5], style: "Aisle seat", say: ["“Let's", "go.”"], blurb: "Always ahead.", picture: null });
    expect(p.traits).toHaveLength(6);
  });

  it("keeps an edited personality's id and picture", () => {
    const current = t.personalities[1];
    const p = readPersonalityForm(form(filled).get, form(filled).has, current);
    expect([p.id, p.picture]).toEqual([current.id, current.picture]);
  });

  it("refuses without a name, a colour, six traits or exactly three ticks", () => {
    const bad = (over: Record<string, string>, drop: string[] = []) => {
      const v: Record<string, string> = { ...filled, ...over };
      for (const k of drop) delete v[k];
      return () => readPersonalityForm(form(v).get, form(v).has, null);
    };
    expect(bad({ name: "" })).toThrow(/name/i);
    expect(bad({ colour: "blue" })).toThrow(/colour/i);
    expect(bad({ trait_3: " " })).toThrow(/6 traits/);
    expect(bad({}, ["tick_5"])).toThrow(/3/);
    expect(bad({ tick_1: "on" })).toThrow(/3/);
  });
});

describe("readLookForm", () => {
  it("reads the labels, falling back on the travel set's for a blank one", () => {
    const f = form({ label_0: "TASTE PROFILE", label_1: " ", label_2: "PERFECT FOR", cover_theme: "on", cover_colour: "#112233" });
    expect(readLookForm(f.get, f.has)).toEqual({ labels: ["TASTE PROFILE", DEFAULT_LABELS[1], "PERFECT FOR"], colour: null });
  });

  it("keeps the organiser's cover colour when not following the theme", () => {
    const f = form({ cover_colour: "#112233" });
    expect(readLookForm(f.get, f.has).colour).toBe("#112233");
  });
});
