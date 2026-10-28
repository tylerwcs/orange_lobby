import { describe, it, expect } from "vitest";
import { validateAnswers } from "@/lib/registration";
import type { RegistrationQuestion } from "@/lib/types";

const questions = [
  { key: "rate", label: "How would you rate it?", type: "select", options: ["1", "2"], required: true },
] as RegistrationQuestion[];

describe("validateAnswers in Bahasa Malaysia (D741)", () => {
  it("speaks English by default", () => {
    expect(validateAnswers({ rate: "Maybe" }, questions)).toEqual({ ok: false, errors: { rate: "Choose one of the listed options" } });
    expect(validateAnswers({}, questions)).toEqual({ ok: false, errors: { rate: "How would you rate it? is required" } });
  });
  it("speaks Malay when asked, keeping the organiser's question as typed", () => {
    expect(validateAnswers({ rate: "Maybe" }, questions, "ms")).toEqual({ ok: false, errors: { rate: "Pilih salah satu pilihan yang disenaraikan" } });
    expect(validateAnswers({}, questions, "ms")).toEqual({ ok: false, errors: { rate: "How would you rate it? wajib diisi" } });
  });
});
