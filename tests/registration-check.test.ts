import { describe, expect, it } from "vitest";
import type { RegistrationQuestion } from "@/lib/types";
import { CONSENT_FIELD, TERMS_FIELD } from "@/lib/privacy";
import { problemsInFormOrder, registrationErrors } from "@/lib/registration-check";

// Department moved above email, as an organiser may: the list follows the form, not a fixed order.
const form: RegistrationQuestion[] = [
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "department", label: "Department", type: "select", required: true, options: ["Cards", "Data"] },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "diet", label: "Dietary preferences", type: "text", required: false },
];
const filled = { name: "Ann Tan", department: "Cards", email: "ann@uob.test" };

describe("registrationErrors (D546)", () => {
  it("passes a complete form with both ticks", () => {
    expect(registrationErrors({ ...filled, [CONSENT_FIELD]: "yes", [TERMS_FIELD]: "yes" }, form, true)).toEqual({});
  });

  it("names every missing answer and tick at once", () => {
    const errors = registrationErrors({}, form, true);
    expect(Object.keys(errors).sort()).toEqual([CONSENT_FIELD, TERMS_FIELD, "department", "email", "name"].sort());
  });

  it("asks for the terms tick only when the event has terms", () => {
    expect(registrationErrors({ ...filled, [CONSENT_FIELD]: "yes" }, form, false)).toEqual({});
    expect(registrationErrors({ ...filled, [CONSENT_FIELD]: "yes" }, form, true)).toHaveProperty(TERMS_FIELD);
  });
});

describe("problemsInFormOrder (D546)", () => {
  it("lists problems in the order the invitee meets them: questions, terms, consent", () => {
    const errors = registrationErrors({ diet: "Halal" }, form, true);
    expect(problemsInFormOrder(errors, form).map((p) => p.key)).toEqual(["name", "department", "email", TERMS_FIELD, CONSENT_FIELD]);
  });
});
