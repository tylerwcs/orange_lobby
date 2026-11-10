import { describe, expect, it } from "vitest";
import { coverColour, lockedChange, personalityShades, testProblems, travelSet, type PassportTest } from "@/features/passport-test/client";
import { contrastRatio, hexToRgb } from "@/lib/contrast";

const clone = (t: PassportTest): PassportTest => JSON.parse(JSON.stringify(t));
const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a)!, hexToRgb(b)!);

describe("testProblems", () => {
  it("asks for at least 5 questions", () => {
    const t = travelSet();
    t.questions = t.questions.slice(0, 4);
    expect(testProblems(t).join(" ")).toContain("5");
  });

  it("reports an answer pointing at a personality that is gone", () => {
    const t = travelSet();
    t.questions[2].answers[1].personality = "p-deadbeef";
    expect(testProblems(t).join(" ")).toMatch(/question 3/i);
  });

  it("reports two personalities with one name, whatever the case", () => {
    const t = travelSet();
    t.personalities[1].name = "trailblazer";
    expect(testProblems(t).join(" ")).toMatch(/trailblazer/i);
  });

  it("reports a personality without exactly 3 ticked traits", () => {
    const t = travelSet();
    t.personalities[0].ticked = [0, 1];
    expect(testProblems(t).join(" ")).toMatch(/TRAILBLAZER.*3 ticked/);
  });
});

describe("lockedChange", () => {
  const before = travelSet();

  it("allows anything before anyone has taken the test", () => {
    const after = clone(before);
    after.questions.pop();
    expect(lockedChange(before, after, 0)).toBeNull();
  });

  const refused: [string, (t: PassportTest) => void][] = [
    ["an answer pointed elsewhere", (t) => { t.questions[0].answers[0].personality = t.personalities[1].id; }],
    ["a question added", (t) => { t.questions.push({ ...t.questions[0], id: "q-0000000f" }); }],
    ["a question removed", (t) => { t.questions.pop(); }],
    ["questions reordered", (t) => { t.questions.reverse(); }],
    ["a personality removed", (t) => { t.personalities.pop(); }],
  ];
  for (const [label, change] of refused) {
    it(`refuses ${label} once 3 guests have results`, () => {
      const after = clone(before);
      change(after);
      expect(lockedChange(before, after, 3)).toContain("3 guests have taken this test");
    });
  }

  const allowed: [string, (t: PassportTest) => void][] = [
    ["question words, scene and picture", (t) => { t.questions[0].text = "New?"; t.questions[0].scene = "New"; t.questions[0].image = "https://x.test/a.webp"; t.questions[0].answers[0].text = "New"; }],
    ["a personality's look and words", (t) => { Object.assign(t.personalities[0], { name: "PATHFINDER", colour: "#112233", traits: ["a", "b", "c", "d", "e", "f"], ticked: [3, 4, 5], style: "s", say: ["x", "y"], blurb: "b" }); }],
    ["labels and cover", (t) => { t.labels = ["A", "B", "C"]; t.cover = { colour: "#000000", crest: null }; }],
    ["a personality added", (t) => { t.personalities.push({ ...t.personalities[0], id: "p-0000000f", name: "NEW" }); }],
  ];
  for (const [label, change] of allowed) {
    it(`allows ${label} after results`, () => {
      const after = clone(before);
      change(after);
      expect(lockedChange(before, after, 3)).toBeNull();
    });
  }

  it("says 1 guest has", () => {
    const after = clone(before);
    after.questions.pop();
    expect(lockedChange(before, after, 1)).toContain("1 guest has taken this test");
  });
});

describe("personalityShades", () => {
  it("gives a dark and a light that read on each other", () => {
    const s = personalityShades("#E8693C");
    expect(s.accent).toBe("#E8693C");
    expect(ratio(s.dark, s.light)).toBeGreaterThanOrEqual(7);
  });
});

describe("coverColour", () => {
  const GOLD = "#D9B26A";

  it("darkens a pale brand until the gold reads", () => {
    const t = travelSet();
    expect(ratio(coverColour(t, "#FFD54F"), GOLD)).toBeGreaterThanOrEqual(3);
  });

  it("lets the organiser's colour win, darkened the same way", () => {
    const t = travelSet();
    t.cover.colour = "#0B2A4A";
    expect(coverColour(t, "#FFD54F")).toBe("#0B2A4A");
    t.cover.colour = "#FFFFFF";
    expect(ratio(coverColour(t, null), GOLD)).toBeGreaterThanOrEqual(3);
  });
});
