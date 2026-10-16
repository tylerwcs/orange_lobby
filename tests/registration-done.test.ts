import { describe, it, expect } from "vitest";
import { doneCopy, fillName, showsDoneQr, DEFAULT_DONE_MESSAGE_DOOR, DEFAULT_DONE_MESSAGE_NO_DOOR } from "@/lib/registration-done";

const base = { registration_done_title: null, registration_done_message: null, check_in_enabled: true, registration_show_qr: true };

describe("doneCopy", () => {
  it("keeps the old wording when nothing is written", () => {
    expect(doneCopy(base, "Mei Ling Tan")).toEqual({ title: "You're in, Mei", message: DEFAULT_DONE_MESSAGE_DOOR });
  });

  it("follows the QR for the default message only", () => {
    expect(doneCopy({ ...base, check_in_enabled: false }, "Ali").message).toBe(DEFAULT_DONE_MESSAGE_NO_DOOR);
    // D634: check-in on but the QR switched off - nothing to "show at the door" on this page.
    expect(doneCopy({ ...base, registration_show_qr: false }, "Ali").message).toBe(DEFAULT_DONE_MESSAGE_NO_DOOR);
    expect(doneCopy({ ...base, check_in_enabled: false, registration_done_message: "See you there" }, "Ali").message).toBe("See you there");
  });

  it("uses the organiser's words, with {name} filled in both", () => {
    const e = { ...base, registration_done_title: "Welcome aboard, {name}!", registration_done_message: "Hi {name},\nsee you at 9." };
    expect(doneCopy(e, "Ali Bin Abu")).toEqual({ title: "Welcome aboard, Ali!", message: "Hi Ali,\nsee you at 9." });
  });

  it("treats a blank field as unset", () => {
    expect(doneCopy({ ...base, registration_done_title: "   " }, "Ali").title).toBe("You're in, Ali");
  });
});

describe("showsDoneQr (D634)", () => {
  it("needs both check-in and the switch; off when the switch is unset", () => {
    expect(showsDoneQr(base)).toBe(true);
    expect(showsDoneQr({ ...base, registration_show_qr: false })).toBe(false);
    expect(showsDoneQr({ check_in_enabled: true })).toBe(false);
    expect(showsDoneQr({ ...base, check_in_enabled: false })).toBe(false);
  });
});

describe("fillName", () => {
  it("matches {name} in any case and with spaces", () => {
    expect(fillName("{NAME} / { name } / {Name}", "Ali")).toBe("Ali / Ali / Ali");
  });
});
