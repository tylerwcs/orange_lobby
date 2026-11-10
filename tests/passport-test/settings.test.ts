import { describe, expect, it } from "vitest";
import { DEFAULT_LABELS, newTestId, readPassportTest, travelSet, testProblems } from "@/features/passport-test/client";

describe("readPassportTest", () => {
  it("gives an empty, switched-off test for nothing", () => {
    expect(readPassportTest(null)).toEqual({
      on: false, questions: [], personalities: [], labels: DEFAULT_LABELS, cover: { colour: null, crest: null },
    });
  });

  it("drops a damaged question and keeps the rest", () => {
    const good = { id: "q-0000000a", scene: "Boarding", text: "Which seat?", image: null, answers: [] };
    const t = readPassportTest({ on: true, questions: [{ scene: "no id", text: "x", answers: [] }, good] });
    expect(t.on).toBe(true);
    expect(t.questions.map((q) => q.id)).toEqual(["q-0000000a"]);
  });

  it("falls back on damaged labels and cover", () => {
    const t = readPassportTest({ labels: 7, cover: { colour: "red", crest: "javascript:alert(1)" } });
    expect(t.labels).toEqual(DEFAULT_LABELS);
    expect(t.cover).toEqual({ colour: null, crest: null });
  });

  it("accepts a built-in character path but no other local path", () => {
    const p = (picture: string) => ({ id: "p-0000000a", name: "A", colour: "#E8693C", picture, traits: [], ticked: [], style: "", say: ["", ""], blurb: "" });
    expect(readPassportTest({ personalities: [p("/passport/characters/navigator.svg")] }).personalities[0].picture).toBe("/passport/characters/navigator.svg");
    expect(readPassportTest({ personalities: [p("/etc/passwd")] }).personalities[0].picture).toBeNull();
  });
});

describe("newTestId", () => {
  it("is the prefix and eight hex characters", () => {
    expect(newTestId("q")).toMatch(/^q-[0-9a-f]{8}$/);
    expect(newTestId("p")).not.toBe(newTestId("p"));
  });
});

describe("travelSet", () => {
  const t = travelSet();

  it("has ten questions of four answers and four personalities", () => {
    expect(t.on).toBe(false);
    expect(t.questions).toHaveLength(10);
    expect(t.questions.every((q) => q.answers.length === 4)).toBe(true);
    expect(t.personalities.map((p) => p.name)).toEqual(["TRAILBLAZER", "NAVIGATOR", "DAYDREAMER", "FLAVOUR HUNTER"]);
  });

  it("points each question's answers at four different personalities", () => {
    for (const q of t.questions) expect(new Set(q.answers.map((a) => a.personality)).size).toBe(4);
  });

  it("is ready to switch on, with built-in characters", () => {
    expect(testProblems(t)).toEqual([]);
    expect(t.personalities.every((p) => p.picture?.startsWith("/passport/characters/"))).toBe(true);
  });

  it("survives its own reader unchanged", () => {
    expect(readPassportTest(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });

  it("gets fresh ids each time", () => {
    expect(travelSet().questions[0].id).not.toBe(t.questions[0].id);
  });
});

describe("readPassportTest keeps what the admin form saved (review: emoji and long text)", () => {
  it("keeps an 80-character answer ending in an emoji", () => {
    const text = `${"a".repeat(79)}😀`;
    const q = { id: "q-0000000a", scene: "", text: "Q?", image: null, answers: [{ id: "a-0000000a", text, icon: "🙂", personality: "p-0000000a" }] };
    expect(readPassportTest({ questions: [q] }).questions[0].answers[0].text).toBe(text);
  });

  it("clips an over-long trait instead of wiping every trait", () => {
    const p = { id: "p-0000000a", name: "A", colour: "#E8693C", picture: null, traits: ["x".repeat(30), "b", "c", "d", "e", "f"], ticked: [0, 1, 2], style: "", say: ["", ""], blurb: "" };
    const traits = readPassportTest({ personalities: [p] }).personalities[0].traits;
    expect(traits).toHaveLength(6);
    expect(traits[0]).toBe("x".repeat(24));
  });
});
