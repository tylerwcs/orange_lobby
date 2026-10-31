import { describe, it, expect } from "vitest";
import { formsLost, joinNames, unsavedChangesMessage } from "@/lib/unsaved-changes";

describe("unsaved changes copy (D778)", () => {
  it("joins names with commas and a final and", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Event"])).toBe("Event");
    expect(joinNames(["Portal look", "Registration"])).toBe("Portal look and Registration");
    expect(joinNames(["Event", "Portal look", "Registration"])).toBe("Event, Portal look and Registration");
  });
  it("names one dirty tab", () => {
    expect(unsavedChangesMessage(["Registration"])).toBe("You have unsaved changes on Registration. Save anyway and lose them?");
  });
  it("names every dirty tab", () => {
    expect(unsavedChangesMessage(["Portal look", "Registration"])).toBe("You have unsaved changes on Portal look and Registration. Save anyway and lose them?");
  });
});

describe("formsLost (D778)", () => {
  const portal = { id: "portal" };
  const registration = { id: "registration" };
  it("counts every dirty tab when another kind of form submits", () => {
    expect(formsLost({ id: "me-page" }, [portal, registration])).toEqual([portal, registration]);
  });
  it("counts the other dirty tabs when a tab form submits, not its own", () => {
    expect(formsLost(portal, [portal, registration])).toEqual([registration]);
  });
  it("is empty when only the submitting tab is dirty, or nothing is", () => {
    expect(formsLost(portal, [portal])).toEqual([]);
    expect(formsLost(portal, [])).toEqual([]);
  });
});
