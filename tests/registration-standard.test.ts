import { describe, it, expect } from "vitest";
import { answerQuestions, editorQuestions, isStandardKey, normaliseRegistrationForm, registrationForm } from "@/lib/registration-standard";
import type { RegistrationQuestion } from "@/lib/types";

const q = (key: string, extra: Partial<RegistrationQuestion> = {}): RegistrationQuestion =>
  ({ key, label: key, type: "text", required: false, ...extra });
const keys = (qs: RegistrationQuestion[]) => qs.map((x) => x.key);

describe("registrationForm", () => {
  it("puts name and email first on a form saved before they were in the list", () => {
    expect(keys(registrationForm([q("nickname"), q("phone")]))).toEqual(["name", "email", "nickname", "phone"]);
  });
  it("keeps them where the organiser moved them", () => {
    expect(keys(registrationForm([q("nickname"), q("name"), q("phone"), q("email")]))).toEqual(["nickname", "name", "phone", "email"]);
  });
  it("puts a missing email straight after name", () => {
    expect(keys(registrationForm([q("nickname"), q("name"), q("phone")]))).toEqual(["nickname", "name", "email", "phone"]);
  });
  it("does not add mobile or department to what the invitee sees", () => {
    expect(keys(registrationForm([]))).toEqual(["name", "email"]);
  });
});

describe("answerQuestions", () => {
  it("leaves out name and email, which are not answers", () => {
    expect(keys(answerQuestions([q("name"), q("department"), q("email"), q("phone")]))).toEqual(["department", "phone"]);
  });
});

describe("editorQuestions", () => {
  it("offers all four on an event with no questions", () => {
    expect(keys(editorQuestions([]))).toEqual(["name", "email", "phone", "department"]);
  });
  it("adds only what is missing, after the standard questions ahead of it", () => {
    expect(keys(editorQuestions([q("name"), q("email"), q("nickname"), q("department")])))
      .toEqual(["name", "email", "phone", "nickname", "department"]);
  });
});

describe("normaliseRegistrationForm", () => {
  it("refuses two questions that would save to the same answer", () => {
    expect(() => normaliseRegistrationForm([q("department", { label: "Department" }), q("department", { label: "Department" })])).toThrow(/same answer/);
  });
  it("puts back a standard question a hand-made post left out", () => {
    expect(keys(normaliseRegistrationForm([q("nickname")]))).toEqual(["name", "email", "phone", "department", "nickname"]);
  });
  it("reapplies the locks: name always required, mobile always a phone, none of them conditional", () => {
    const out = normaliseRegistrationForm([
      q("name", { label: "Your name", description: "As on your IC" }),
      q("email", { required: true }),
      q("phone", { type: "number", show_when: { key: "name", includes: "x" } }),
      q("department", { type: "select", options: ["Sales", "Ops"], required: true }),
    ]);
    expect(out[0]).toEqual({ key: "name", label: "Your name", type: "text", required: true, description: "As on your IC" });
    expect(out[2]).toEqual({ key: "phone", label: "phone", type: "phone", required: false });
    expect(out[3]).toEqual({ key: "department", label: "department", type: "select", required: true, options: ["Sales", "Ops"] });
  });
  it("leaves the organiser's own questions alone", () => {
    const own = q("room_partner", { show_when: { key: "stay", includes: "Twin" } });
    expect(normaliseRegistrationForm([q("name"), q("email"), q("phone"), q("department"), own])[4]).toBe(own);
  });
});

describe("isStandardKey", () => {
  it("knows the four", () => {
    expect(["name", "email", "phone", "department", "nickname"].map(isStandardKey)).toEqual([true, true, true, true, false]);
  });
});
