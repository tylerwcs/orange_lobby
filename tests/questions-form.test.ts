import { describe, it, expect } from "vitest";
import { draftFrom, keyFor, questionFormEntries, questionsFromForm } from "@/lib/questions-form";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import type { RegistrationQuestion } from "@/lib/types";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("questionsFromForm", () => {
  it("builds questions from numbered rows, skipping blank ones", () => {
    const qs = questionsFromForm(form({
      q_1_key: "Shirt Size", q_1_label: "Shirt Size", q_1_type: "select", q_1_required: "on", q_1_options: "S, M, L",
      q_2_key: "", q_2_label: "",
      q_3_key: "room_partner", q_3_label: "Room Partner", q_3_type: "text", q_3_description: "Twin rooms only", q_3_show_key: "stay_overnight", q_3_show_value: "Twin",
    }));
    expect(qs).toHaveLength(2);
    expect(qs[0]).toMatchObject({ key: "shirt_size", label: "Shirt Size", type: "select", required: true, options: ["S", "M", "L"] });
    expect(qs[1]).toMatchObject({ key: "room_partner", required: false, description: "Twin rooms only", show_when: { key: "stay_overnight", includes: "Twin" } });
  });
  it("throws a readable error for a select without options", () => {
    expect(() => questionsFromForm(form({ q_1_key: "x", q_1_label: "X", q_1_type: "select" }))).toThrow(/options/);
  });
  it("keeps a phone or number question's type through the form round trip", () => {
    // The parser used to collapse anything that wasn't "select" down to "text", so a saved
    // phone or number question reverted to text the next time Settings was saved for any
    // unrelated reason — Event details and Registration share one SaveBar.
    const qs = questionsFromForm(form({
      q_1_key: "mobile", q_1_label: "Mobile", q_1_type: "phone",
      q_2_key: "guests", q_2_label: "Guests", q_2_type: "number",
    }));
    expect(qs[0]).toMatchObject({ key: "mobile", type: "phone" });
    expect(qs[1]).toMatchObject({ key: "guests", type: "number" });
  });
});

const read = (entries: [string, string][]) => {
  const map = new Map(entries);
  return questionsFromForm((k) => map.get(k) ?? null, FORM_QUESTION_TYPES, 10);
};

describe("questionFormEntries", () => {
  const saved: RegistrationQuestion[] = [
    { key: "goal", label: "Your goal", type: "textarea", required: true },
    { key: "track", label: "Track", type: "select", required: false, options: ["Weight", "Muscle"], description: "Pick one" },
    { key: "target_kg", label: "Target (kg)", type: "number", required: false, show_when: { key: "track", includes: "Weight" } },
  ];

  it("round-trips saved questions through the fields questionsFromForm reads (D247)", () => {
    expect(read(questionFormEntries(saved.map(draftFrom)))).toEqual(saved);
  });

  it("keeps a saved key when the label changes, so stored answers stay attached (D244)", () => {
    const [first] = saved.map(draftFrom);
    expect(read(questionFormEntries([{ ...first, label: "What is your goal?" }]))[0].key).toBe("goal");
  });

  it("gives a new question the key its label makes, the same rule keyFor states", () => {
    const fresh = { key: "", label: "Before photo", type: "file" as const, required: true, options: [], description: "", showKey: "", showValue: "" };
    expect(read(questionFormEntries([fresh]))[0].key).toBe("before_photo");
    expect(keyFor("Before photo")).toBe("before_photo");
  });

  it("numbers questions in their on-screen order and drops unlabelled drafts", () => {
    const drafts = saved.map(draftFrom).reverse();
    drafts.splice(1, 0, { key: "", label: "", type: "text", required: false, options: [], description: "", showKey: "", showValue: "" });
    expect(read(questionFormEntries(drafts)).map((q) => q.key)).toEqual(["target_kg", "track", "goal"]);
  });
});
