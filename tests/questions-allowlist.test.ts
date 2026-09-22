import { describe, expect, it } from "vitest";
import { parseQuestions, REGISTRATION_QUESTION_TYPES, FORM_QUESTION_TYPES } from "@/lib/registration";

const q = (over: Record<string, unknown> = {}) => ({ key: "k", label: "L", type: "text", required: false, ...over });

describe("parseQuestions allowlist", () => {
  it("accepts the four types registration has always had", () => {
    for (const type of ["text", "phone", "number", "select"]) {
      const input = [q({ type, ...(type === "select" ? { options: ["a"] } : {}) })];
      expect(parseQuestions(input, REGISTRATION_QUESTION_TYPES)).toHaveLength(1);
    }
  });

  // D164: there is no attendee row yet at registration to hang a file on, and the
  // registration page is public. The narrowing is the point of the allowlist.
  it("refuses a file question on the registration form", () => {
    expect(() => parseQuestions([q({ type: "file" })], REGISTRATION_QUESTION_TYPES)).toThrow();
  });

  it("refuses a textarea on the registration form", () => {
    expect(() => parseQuestions([q({ type: "textarea" })], REGISTRATION_QUESTION_TYPES)).toThrow();
  });

  it("accepts file and textarea on a form", () => {
    expect(parseQuestions([q({ type: "file" }), q({ key: "k2", type: "textarea" })], FORM_QUESTION_TYPES)).toHaveLength(2);
  });

  it("still requires options on a select, whichever list is in force", () => {
    expect(() => parseQuestions([q({ type: "select" })], FORM_QUESTION_TYPES)).toThrow(/options/);
  });

  it("names the offending field in the message", () => {
    expect(() => parseQuestions([q({ key: "Bad Key!" })], FORM_QUESTION_TYPES)).toThrow(/key/);
  });
});
