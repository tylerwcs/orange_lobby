import { describe, it, expect } from "vitest";
import { questionsFromForm } from "@/lib/questions-form";

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
});
