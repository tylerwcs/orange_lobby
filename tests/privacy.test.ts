import { describe, expect, it } from "vitest";
import { CONSENT_FIELD, consentError } from "@/lib/privacy";

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
