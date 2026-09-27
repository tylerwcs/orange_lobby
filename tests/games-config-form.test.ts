import { describe, expect, it } from "vitest";
import { configFromForm, packQuestions } from "@/lib/games/config-form";

const CP = "0b7c3d9e-1f2a-4b5c-8d6e-7f8091a2b3c4";
const THEME = { kind: "theme", url: null };

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
    expect(configFromForm("tap_race", form([["duration_s", "30"]]))).toEqual({ ok: true, config: { duration_s: 30, background: THEME } });
  });
  it("explains a race that is too short", () => {
    expect(configFromForm("tap_race", form([["duration_s", "3"]]))).toEqual({ ok: false, error: "A race runs for 10 to 60 seconds." });
  });
  it("reads last one standing", () => {
    const r = configFromForm("survival", form([["answer_s", "12"], ["questions", JSON.stringify([{ text: "Q", options: ["A", "B"], correct: 1 }])]]));
    expect(r).toEqual({ ok: true, config: { answer_s: 12, questions: [{ text: "Q", options: ["A", "B"], correct: 1 }], background: THEME } });
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
      ["checkpoint_id", CP], ["exclude", "Crew"], ["exclude", "Management"],
      ["prizes", JSON.stringify([{ name: "iPad", quantity: 1 }])], ["spin_s", "6"], ["rounds", "4"],
    ]));
    expect(r).toEqual({
      ok: true,
      config: {
        checkpoint_id: CP, exclude_categories: ["Crew", "Management"], prizes: [{ name: "iPad", quantity: 1 }],
        format: "slot", spin_s: 6, rounds: 4, background: THEME,
      },
    });
  });
  it("refuses a checkpoint that is not an id", () => {
    const r = configFromForm("draw", form([["checkpoint_id", "cp1"], ["prizes", "[]"], ["spin_s", "6"], ["rounds", "4"]]));
    expect(r).toEqual({ ok: false, error: "Pick a checkpoint from the list." });
  });
  it("reads no checkpoint as null", () => {
    const r = configFromForm("draw", form([["checkpoint_id", ""], ["prizes", "[]"], ["spin_s", "6"], ["rounds", "4"]]));
    expect(r.ok && (r.config as { checkpoint_id: string | null }).checkpoint_id).toBeNull();
  });
  it("names the prize that is wrong", () => {
    const r = configFromForm("draw", form([
      ["prizes", JSON.stringify([{ name: "iPad", quantity: 1 }, { name: "", quantity: 1 }])],
      ["spin_s", "6"], ["rounds", "4"],
    ]));
    expect(r).toEqual({ ok: false, error: "Prize 2 needs a name and a quantity from 1 to 500." });
  });
});

describe("draw format fields (D310, D311, D315)", () => {
  const cp = "11111111-1111-4111-8111-111111111111";
  const base: [string, string][] = [["checkpoint_id", cp], ["prizes", JSON.stringify([{ name: "Mug", quantity: 2 }])]];
  it("reads format, spin time and rounds", () => {
    const r = configFromForm("draw", form([...base, ["format", "mosaic"], ["spin_s", "9"], ["rounds", "5"]]));
    expect(r).toMatchObject({ ok: true, config: { format: "mosaic", spin_s: 9, rounds: 5 } });
  });
  it("explains a spin time out of range", () => {
    const r = configFromForm("draw", form([...base, ["format", "slot"], ["spin_s", "2"], ["rounds", "4"]]));
    expect(r).toEqual({ ok: false, error: "Spin time is 3 to 20 seconds." });
  });
  it("explains rounds out of range", () => {
    const r = configFromForm("draw", form([...base, ["format", "mosaic"], ["spin_s", "6"], ["rounds", "9"]]));
    expect(r).toEqual({ ok: false, error: "Rounds are 2 to 8." });
  });
  it("explains a card round over 20 cards", () => {
    const big: [string, string][] = [["checkpoint_id", cp], ["prizes", JSON.stringify([{ name: "Mug", quantity: 21 }])]];
    const r = configFromForm("draw", form([...big, ["format", "cards"], ["spin_s", "6"], ["rounds", "4"]]));
    expect(r).toEqual({ ok: false, error: "A card round has at most 20 cards: its prize quantities must add up to 20 or fewer." });
  });
});
