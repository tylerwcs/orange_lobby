import { describe, it, expect } from "vitest";
import { doneCopy, fillName, showsDonePage, showsDoneQr, DEFAULT_DONE_MESSAGE_DOOR, DEFAULT_DONE_MESSAGE_NO_DOOR } from "@/lib/registration-done";

const base = { registration_done_title: null, registration_done_message: null, check_in_enabled: true };

describe("doneCopy", () => {
  it("keeps the old wording when nothing is written", () => {
    expect(doneCopy(base, "Mei Ling Tan")).toEqual({ title: "Thanks for registering, Mei", message: DEFAULT_DONE_MESSAGE_DOOR });
  });

  it("follows check-in for the default message only", () => {
    expect(doneCopy({ ...base, check_in_enabled: false }, "Ali").message).toBe(DEFAULT_DONE_MESSAGE_NO_DOOR);
    expect(doneCopy({ ...base, check_in_enabled: false, registration_done_message: "See you there" }, "Ali").message).toBe("See you there");
  });

  it("uses the organiser's words, with {name} filled in both", () => {
    const e = { ...base, registration_done_title: "Welcome aboard, {name}!", registration_done_message: "Hi {name},\nsee you at 9." };
    expect(doneCopy(e, "Ali Bin Abu")).toEqual({ title: "Welcome aboard, Ali!", message: "Hi Ali,\nsee you at 9." });
  });

  it("treats a blank field as unset", () => {
    expect(doneCopy({ ...base, registration_done_title: "   " }, "Ali").title).toBe("Thanks for registering, Ali");
  });
});

describe("showsDonePage (D634)", () => {
  it("is off unless the organiser turned it on", () => {
    expect(showsDonePage({})).toBe(false);
    expect(showsDonePage({ registration_done_page: false })).toBe(false);
    expect(showsDonePage({ registration_done_page: true })).toBe(true);
  });
});

describe("showsDoneQr (D804)", () => {
  it("shows the code with check-in on, unless its own switch is off", () => {
    expect(showsDoneQr({ check_in_enabled: true })).toBe(true);
    expect(showsDoneQr({ check_in_enabled: true, registration_done_qr: false })).toBe(false);
    expect(showsDoneQr({ check_in_enabled: false, registration_done_qr: true })).toBe(false);
  });

  it("drops the at-the-door default message when the code is off", () => {
    expect(doneCopy({ ...base, registration_done_qr: false }, "Ali").message).toBe(DEFAULT_DONE_MESSAGE_NO_DOOR);
  });
});

describe("fillName", () => {
  it("matches {name} in any case and with spaces", () => {
    expect(fillName("{NAME} / { name } / {Name}", "Ali")).toBe("Ali / Ali / Ali");
  });
});
