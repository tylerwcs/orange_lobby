import { describe, it, expect } from "vitest";
import { joinNames, unsavedChangesMessage } from "@/lib/unsaved-changes";

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
