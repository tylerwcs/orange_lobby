import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/lib/registration";
import type { RegistrationQuestion } from "@/lib/types";

const q = (over: Partial<RegistrationQuestion> = {}): RegistrationQuestion =>
  ({ key: "mood", label: "Mood", type: "text", required: false, ...over });

describe("validateAnswers", () => {
  it("returns the trimmed answers when everything is fine", () => {
    const r = validateAnswers({ mood: "  good  " }, [q()]);
    expect(r).toEqual({ ok: true, answers: { mood: "good" } });
  });

  it("names the question that was required and blank", () => {
    const r = validateAnswers({ mood: "" }, [q({ required: true })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.mood).toBe("Mood is required");
  });

  it("rejects a select answer that is not one of its options", () => {
    const r = validateAnswers({ mood: "Elated" }, [q({ type: "select", options: ["Good", "Bad"] })]);
    expect(r.ok).toBe(false);
  });

  it("accepts a select answer that is one of its options", () => {
    expect(validateAnswers({ mood: "Good" }, [q({ type: "select", options: ["Good", "Bad"] })]).ok).toBe(true);
  });

  // A hidden question is not merely skipped: it stores "" so a stale answer is cleared.
  it("blanks a question its show_when is hiding, and does not require it", () => {
    const questions = [
      q({ key: "unwell", type: "select", options: ["Yes", "No"] }),
      q({ key: "symptoms", required: true, show_when: { key: "unwell", includes: "Yes" } }),
    ];
    const r = validateAnswers({ unwell: "No", symptoms: "" }, questions);
    expect(r).toEqual({ ok: true, answers: { unwell: "No", symptoms: "" } });
  });

  it("requires a shown question even when it is conditional", () => {
    const questions = [
      q({ key: "unwell", type: "select", options: ["Yes", "No"] }),
      q({ key: "symptoms", required: true, show_when: { key: "unwell", includes: "Yes" } }),
    ];
    expect(validateAnswers({ unwell: "Yes", symptoms: "" }, questions).ok).toBe(false);
  });

  it("carries a textarea answer through unchanged apart from trimming", () => {
    const r = validateAnswers({ mood: " line one\nline two " }, [q({ type: "textarea" })]);
    expect(r.ok && r.answers.mood).toBe("line one\nline two");
  });

  it("treats a file answer as the stored object path it is given", () => {
    const r = validateAnswers({ mood: "org/event/submission-abc.png" }, [q({ type: "file" })]);
    expect(r.ok && r.answers.mood).toBe("org/event/submission-abc.png");
  });

  it("reports every bad question at once rather than stopping at the first", () => {
    const r = validateAnswers({ a: "", b: "" }, [
      q({ key: "a", label: "A", required: true }),
      q({ key: "b", label: "B", required: true }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["a", "b"]);
  });
});
