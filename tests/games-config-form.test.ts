import { describe, expect, it } from "vitest";
import { configFromForm, packQuestions } from "@/lib/games/config-form";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("packQuestions", () => {
  it("drops blank options and moves the correct index with them", () => {
    expect(packQuestions([{ text: "Q", options: ["A", "", "C", ""], correct: 2 }]))
      .toEqual([{ text: "Q", options: ["A", "C"], correct: 1 }]);
  });
  it("marks a blank correct option as invalid so the form says so", () => {
    expect(packQuestions([{ text: "Q", options: ["A", "", "C", ""], correct: 1 }])[0]).toMatchObject({ correct: -1 });
  });
});

describe("configFromForm", () => {
  it("reads a race", () => {
    expect(configFromForm("tap_race", form([["duration_s", "30"]]))).toEqual({ ok: true, config: { duration_s: 30 } });
  });
  it("explains a race that is too short", () => {
    expect(configFromForm("tap_race", form([["duration_s", "3"]]))).toEqual({ ok: false, error: "A race runs for 10 to 60 seconds." });
  });
  it("reads last one standing", () => {
    const r = configFromForm("survival", form([["answer_s", "12"], ["questions", JSON.stringify([{ text: "Q", options: ["A", "B"], correct: 1 }])]]));
    expect(r).toEqual({ ok: true, config: { answer_s: 12, questions: [{ text: "Q", options: ["A", "B"], correct: 1 }] } });
  });
  it("names the question that is wrong", () => {
    const r = configFromForm("survival", form([["answer_s", "10"], ["questions", JSON.stringify([
      { text: "Q1", options: ["A", "B"], correct: 0 },
      { text: "Q2", options: ["A", "B"], correct: -1 },
    ])]]));
    expect(r).toEqual({ ok: false, error: "Question 2: pick which option is correct." });
  });
  it("says so when the questions cannot be read", () => {
    expect(configFromForm("survival", form([["answer_s", "10"], ["questions", "{not json"]])))
      .toEqual({ ok: false, error: "The questions could not be read. Reload the page and try again." });
  });
  it("reads a draw with exclusions", () => {
    const r = configFromForm("draw", form([
      ["checkpoint_id", "cp1"], ["exclude", "Crew"], ["exclude", "Management"],
      ["prizes", JSON.stringify([{ name: "iPad", quantity: 1 }])],
    ]));
    expect(r).toEqual({ ok: true, config: { checkpoint_id: "cp1", exclude_categories: ["Crew", "Management"], prizes: [{ name: "iPad", quantity: 1 }] } });
  });
  it("reads no checkpoint as null", () => {
    const r = configFromForm("draw", form([["checkpoint_id", ""], ["prizes", "[]"]]));
    expect(r.ok && (r.config as { checkpoint_id: string | null }).checkpoint_id).toBeNull();
  });
  it("names the prize that is wrong", () => {
    const r = configFromForm("draw", form([["prizes", JSON.stringify([{ name: "iPad", quantity: 1 }, { name: "", quantity: 1 }])]]));
    expect(r).toEqual({ ok: false, error: "Prize 2 needs a name and a quantity from 1 to 500." });
  });
});
