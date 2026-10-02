import { describe, expect, it } from "vitest";
import {
  addDays, mondayOf, inChallenge, challengeWeeks, weekFor, gridWeek, weekLabel,
  stepPoints, nextStep, parseSteps, stepsText, readScoring,
} from "@/lib/challenge";
import type { ChallengeScoring, RegistrationQuestion } from "@/lib/types";

const MILEAGE: ChallengeScoring = {
  metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 4 }, { at: 8, pts: 6 }, { at: 10, pts: 8 }],
  team_bonus: 20, podium: [20, 12, 6],
};

describe("dates", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-05", -1)).toBe("2026-10-04");
  });

  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2026-12-04")).toBe("2026-11-30");
  });

  it("knows the challenge's days, inclusive", () => {
    expect(inChallenge(MILEAGE, "2026-10-04")).toBe(false);
    expect(inChallenge(MILEAGE, "2026-10-05")).toBe(true);
    expect(inChallenge(MILEAGE, "2026-12-04")).toBe(true);
    expect(inChallenge(MILEAGE, "2026-12-05")).toBe(false);
  });
});

describe("challengeWeeks (D378)", () => {
  const weeks = challengeWeeks(MILEAGE, "2026-09-28");

  it("numbers weeks from the event's first week, so Mileage runs Week 2 to Week 10", () => {
    expect(weeks.map((w) => w.number)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("gives full Mon–Sun weeks and a Mon–Fri last week", () => {
    expect(weeks[0].days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(weeks[8].days).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
  });

  it("counts from the challenge's own start when the event has no start date", () => {
    expect(challengeWeeks(MILEAGE, null)[0].number).toBe(1);
  });

  it("finds the week of a day, and labels it", () => {
    expect(weekFor(weeks, "2026-10-08")?.number).toBe(2);
    expect(weekFor(weeks, "2026-12-06")).toBeNull();
    expect(weekLabel(weeks[0])).toBe("Week 2 · 5–11 Oct");
    expect(weekLabel(weeks[3])).toBe("Week 5 · 26 Oct – 1 Nov");
    expect(weekLabel(weeks[8])).toBe("Week 10 · 30 Nov – 4 Dec");
  });

  it("opens a team grid on the asked week, else today's, else the last once it's over (D381)", () => {
    expect(gridWeek(weeks, 4, "2026-11-10")?.number).toBe(4);
    expect(gridWeek(weeks, null, "2026-11-10")?.number).toBe(7);
    // A week that doesn't exist reads as no week asked.
    expect(gridWeek(weeks, 99, "2026-10-06")?.number).toBe(2);
    expect(gridWeek(weeks, null, "2026-12-05")?.number).toBe(10);
    expect(gridWeek(weeks, null, "2027-01-20")?.number).toBe(10);
    expect(gridWeek(weeks, null, "2026-10-01")?.number).toBe(2);
    expect(gridWeek([], null, "2026-10-01")).toBeUndefined();
  });
});

describe("points steps (D377)", () => {
  const steps = MILEAGE.daily_steps!;

  it("maps a daily total to the highest step at or below it", () => {
    expect(stepPoints(0.99, steps)).toBe(0);
    expect(stepPoints(1, steps)).toBe(1);
    expect(stepPoints(6, steps)).toBe(4);
    expect(stepPoints(9.99, steps)).toBe(6);
    expect(stepPoints(10, steps)).toBe(8);
    expect(stepPoints(42, steps)).toBe(8);
  });

  it("names the next step, or null at the top", () => {
    expect(nextStep(4.2, steps)).toEqual({ at: 5, pts: 4 });
    expect(nextStep(10, steps)).toBeNull();
  });

  it("parses and prints the organiser's text", () => {
    expect(parseSteps("1=1, 3=2, 5=4, 8=6, 10=8")).toEqual(steps);
    expect(stepsText(steps)).toBe("1=1, 3=2, 5=4, 8=6, 10=8");
    expect(parseSteps("  ")).toEqual([]);
    expect(() => parseSteps("1=1, 1=2")).toThrow(/smallest first/);
    expect(() => parseSteps("one=1")).toThrow(/km=points/);
  });
});

describe("readScoring (D372)", () => {
  const questions: RegistrationQuestion[] = [
    { key: "method", label: "How", type: "select", required: true, options: ["Watch", "Treadmill"] },
    { key: "km", label: "Distance (km)", type: "number", required: true, min: 1 },
  ];
  const form = (over: Record<string, string> = {}) => {
    const m = new Map(Object.entries({
      scoring_on: "on", scoring_metric: "km", scoring_daily_min: "1",
      scoring_starts_on: "2026-10-05", scoring_ends_on: "2026-12-04",
      scoring_steps: "1=1, 3=2, 5=4, 8=6, 10=8", scoring_team_bonus: "20", scoring_podium: "20, 12, 6",
      ...over,
    }));
    return (k: string) => m.get(k) ?? null;
  };

  it("reads the whole Mileage setting", () => {
    expect(readScoring(form(), questions)).toEqual(MILEAGE);
  });

  it("is null when scoring is off", () => {
    expect(readScoring(form({ scoring_on: "" }), questions)).toBeNull();
  });

  it("leaves out the tiers that are blank", () => {
    expect(readScoring(form({ scoring_steps: "", scoring_team_bonus: "", scoring_podium: "" }), questions))
      .toEqual({ metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04" });
  });

  it("refuses a score question that is not a number question", () => {
    expect(() => readScoring(form({ scoring_metric: "method" }), questions)).toThrow(/number question/);
  });

  it("refuses dates that cannot be right", () => {
    expect(() => readScoring(form({ scoring_ends_on: "2026-10-01" }), questions)).toThrow(/before/);
    expect(() => readScoring(form({ scoring_starts_on: "" }), questions)).toThrow(/start and an end/);
  });

  it("refuses a daily minimum that is not above zero", () => {
    expect(() => readScoring(form({ scoring_daily_min: "0" }), questions)).toThrow(/daily minimum/);
  });
});
