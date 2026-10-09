import { describe, expect, it } from "vitest";
import { CONSENT_FIELD, consentError, HEALTH_CONSENT_FIELD, healthConsentTicked } from "@/lib/privacy";

describe("consentError (D410)", () => {
  it("passes only the ticked box's value", () => {
    expect(consentError({ [CONSENT_FIELD]: "yes" })).toBeNull();
  });

  it("refuses a missing tick, which is how an unticked checkbox posts", () => {
    expect(consentError({ name: "Ann", email: "a@b.co" })).toMatch(/Privacy Notice/);
  });

  it("refuses anything but yes from a hand-made POST", () => {
    expect(consentError({ [CONSENT_FIELD]: "" })).not.toBeNull();
    expect(consentError({ [CONSENT_FIELD]: "on" })).not.toBeNull();
  });
});

describe("healthConsentTicked (D412)", () => {
  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return fd;
  };

  it("accepts only the checkbox's yes", () => {
    expect(healthConsentTicked(form({ [HEALTH_CONSENT_FIELD]: "yes" }))).toBe(true);
    expect(healthConsentTicked(form({}))).toBe(false);
    expect(healthConsentTicked(form({ [HEALTH_CONSENT_FIELD]: "on" }))).toBe(false);
  });

  it("cannot be satisfied by a question's answer: its key has a colon no question key can", () => {
    expect(healthConsentTicked(form({ health_consent: "yes" }))).toBe(false);
  });
});
