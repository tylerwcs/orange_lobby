import { describe, expect, it } from "vitest";
import { CONSENT_FIELD, consentError, HEALTH_CONSENT_FIELD, healthConsentTicked, portalAsks, TERMS_FIELD, termsError } from "@/lib/privacy";

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

describe("termsError (D541)", () => {
  it("asks nothing of an event without terms", () => {
    expect(termsError({}, false)).toBeNull();
  });

  it("passes the ticked box and refuses anything else when the event has terms", () => {
    expect(termsError({ [TERMS_FIELD]: "yes" }, true)).toBeNull();
    expect(termsError({ [CONSENT_FIELD]: "yes" }, true)).toMatch(/event terms/);
    expect(termsError({ [TERMS_FIELD]: "on" }, true)).not.toBeNull();
  });
});

describe("portalAsks (D543)", () => {
  const terms = "<p><strong>1. Photos</strong><br>Photos will be taken.</p>";
  const fresh = { consented_at: null, terms_agreed_at: null };

  it("asks consent alone of an event without terms, as D410 always did", () => {
    expect(portalAsks({ status: "live", registration_terms: null }, fresh)).toEqual({ consent: true, terms: false });
    expect(portalAsks({ status: "live", registration_terms: "<p></p>" }, fresh)).toEqual({ consent: true, terms: false });
  });

  it("asks both of an import or walk-in on an event with terms", () => {
    expect(portalAsks({ status: "live", registration_terms: terms }, fresh)).toEqual({ consent: true, terms: true });
  });

  it("asks the terms alone of someone who registered before the event had them", () => {
    expect(portalAsks({ status: "live", registration_terms: terms }, { consented_at: "2026-10-01T00:00:00Z", terms_agreed_at: null }))
      .toEqual({ consent: false, terms: true });
  });

  it("asks nothing once both are agreed, or of a draft event", () => {
    const both = { consented_at: "2026-10-01T00:00:00Z", terms_agreed_at: "2026-10-15T00:00:00Z" };
    expect(portalAsks({ status: "live", registration_terms: terms }, both)).toEqual({ consent: false, terms: false });
    expect(portalAsks({ status: "draft", registration_terms: terms }, fresh)).toEqual({ consent: false, terms: false });
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
