import { describe, expect, it } from "vitest";
import { hasUnsubmittedChanges, sameAnswers, sectionStatus, stableJson } from "@/features/setup/status";

describe("stableJson / sameAnswers", () => {
  it("ignores key order", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(sameAnswers({ a: "x", b: "y" }, { b: "y", a: "x" })).toBe(true);
  });
  it("tells different values apart, and null from an object", () => {
    expect(sameAnswers({ a: "x" }, { a: "y" })).toBe(false);
    expect(sameAnswers(null, {})).toBe(false);
    expect(sameAnswers(null, null)).toBe(true);
  });
});

describe("sectionStatus (D442)", () => {
  it("is Not started with no row", () => {
    expect(sectionStatus(null)).toBe("not_started");
  });
  it("is Draft before the first submit", () => {
    expect(sectionStatus({ answers: { a: "1" }, submitted: null, applied: null })).toBe("draft");
  });
  it("is Submitted while the submit differs from what was applied", () => {
    expect(sectionStatus({ answers: { a: "1" }, submitted: { a: "1" }, applied: null })).toBe("submitted");
    expect(sectionStatus({ answers: { a: "2" }, submitted: { a: "2" }, applied: { a: "1" } })).toBe("submitted");
  });
  it("is Applied when the submit was applied, even with unsubmitted changes", () => {
    const row = { answers: { a: "3" }, submitted: { a: "2" }, applied: { a: "2" } };
    expect(sectionStatus(row)).toBe("applied");
    expect(hasUnsubmittedChanges(row)).toBe(true);
  });
  it("has no unsubmitted changes before a first submit or when answers match it", () => {
    expect(hasUnsubmittedChanges({ answers: { a: "1" }, submitted: null, applied: null })).toBe(false);
    expect(hasUnsubmittedChanges({ answers: { a: "1" }, submitted: { a: "1" }, applied: null })).toBe(false);
    expect(hasUnsubmittedChanges(null)).toBe(false);
  });
});
