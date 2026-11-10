import { describe, expect, it } from "vitest";
import { checkPicks, cleanHolderName, pickPersonality, saveOutcome, travelSet, type PassportResult, type PassportTest, type TestPick } from "@/features/passport-test/client";

const t = travelSet();
const [A, B, C] = t.personalities.map((p) => p.id);

/** One pick per question, choosing the answer that points at the given personality. */
function picksFor(test: PassportTest, who: string[]): TestPick[] {
  return test.questions.map((q, i) => ({ questionId: q.id, answerId: q.answers.find((a) => a.personality === who[i])!.id }));
}

describe("pickPersonality", () => {
  it("is the personality picked most often", () => {
    expect(pickPersonality(t, picksFor(t, [A, A, B, A, B, A, B, A, B, A]))).toBe(A);
  });

  it("breaks a tie by the most recent pick", () => {
    expect(pickPersonality(t, picksFor(t, [A, A, A, A, A, B, B, B, B, B]))).toBe(B);
    expect(pickPersonality(t, picksFor(t, [A, A, A, A, B, B, B, B, B, A]))).toBe(A);
  });

  it("looks past untied picks to find the latest of the tied", () => {
    // A, B and C have 3 each; D's single pick is last but D isn't tied. B's last pick (index 8) is the latest of the three.
    const D = t.personalities[3].id;
    expect(pickPersonality(t, picksFor(t, [A, B, C, A, B, C, A, C, B, D]))).toBe(B);
  });
});

describe("checkPicks", () => {
  const full = picksFor(t, [A, A, A, A, A, A, A, A, A, A]);

  it("accepts one pick per question in order", () => {
    expect(checkPicks(t, full)).toBeNull();
  });

  it("refuses a missing question", () => {
    expect(checkPicks(t, full.slice(0, 9))).not.toBeNull();
  });

  it("refuses two picks for one question", () => {
    expect(checkPicks(t, [...full.slice(0, 9), full[8]])).not.toBeNull();
  });

  it("refuses an answer from another question", () => {
    const wrong = [...full];
    wrong[0] = { questionId: full[0].questionId, answerId: full[1].answerId };
    expect(checkPicks(t, wrong)).not.toBeNull();
  });

  it("refuses picks out of question order", () => {
    expect(checkPicks(t, [full[1], full[0], ...full.slice(2)])).not.toBeNull();
  });
});

describe("cleanHolderName", () => {
  it("tidies spaces", () => {
    expect(cleanHolderName("  Ana   Lee ", "X")).toBe("Ana Lee");
  });

  it("falls back on the registered name", () => {
    expect(cleanHolderName("   ", "Ana Lee")).toBe("Ana Lee");
  });

  it("keeps at most 40 characters", () => {
    expect(cleanHolderName("a".repeat(50), "X")).toBe("a".repeat(40));
  });

  it("never splits an emoji", () => {
    const out = cleanHolderName(`${"a".repeat(39)}😀😀`, "X");
    expect(out).toBe(`${"a".repeat(39)}😀`);
  });
});

describe("saveOutcome", () => {
  const stored: PassportResult = {
    id: "r1", activity_id: "x", attendee_id: "y", personality_id: A, answers: [], holder_name: "Stored", created_at: "2026-11-10T00:00:00Z",
  };

  it("lets the stored result win over a second save", () => {
    expect(saveOutcome(stored, { personalityId: B, holderName: "New" })).toEqual({ ok: true, personalityId: A, holderName: "Stored" });
  });

  it("returns the computed result when nothing is stored", () => {
    expect(saveOutcome(null, { personalityId: B, holderName: "New" })).toEqual({ ok: true, personalityId: B, holderName: "New" });
  });
});
