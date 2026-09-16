import { describe, expect, it } from "vitest";
import { classifyLoginError, loginErrorCopy, LOGIN_ERRORS } from "@/lib/login-errors";

describe("classifyLoginError", () => {
  it("recognises a wrong password", () => {
    expect(classifyLoginError("Invalid login credentials")).toBe("invalid");
  });

  it("recognises an unconfirmed address", () => {
    expect(classifyLoginError("Email not confirmed")).toBe("unconfirmed");
  });

  it("recognises being rate limited", () => {
    expect(classifyLoginError("Email rate limit exceeded")).toBe("rate");
    expect(classifyLoginError("Too many requests")).toBe("rate");
  });

  it("recognises password sign-in being switched off", () => {
    expect(classifyLoginError("Email logins are disabled")).toBe("disabled");
  });

  // The point of the classifier: anything it does not know becomes `unknown` rather than
  // travelling onward as text.
  it("falls back to unknown for anything else", () => {
    expect(classifyLoginError("Database connection reset by peer")).toBe("unknown");
    expect(classifyLoginError("")).toBe("unknown");
  });
});

describe("loginErrorCopy", () => {
  it("says nothing when there is no error", () => {
    expect(loginErrorCopy(undefined)).toBeNull();
    expect(loginErrorCopy("")).toBeNull();
  });

  it("has copy for every code the app can issue", () => {
    for (const code of LOGIN_ERRORS) {
      const copy = loginErrorCopy(code);
      expect(copy?.title).toBeTruthy();
      expect(copy?.description).toBeTruthy();
    }
  });

  /**
   * The reason this module exists. A crafted query string must not be able to put its own
   * sentence on the login screen — at most it chooses between the five this app wrote.
   */
  it("does not render an attacker's sentence", () => {
    const crafted = "Your account is locked. Call +60 12-345 6789 to restore it.";
    const copy = loginErrorCopy(crafted);
    expect(copy).toEqual(loginErrorCopy("unknown"));
    expect(JSON.stringify(copy)).not.toContain("+60");
    expect(JSON.stringify(copy)).not.toContain("locked");
  });
});
