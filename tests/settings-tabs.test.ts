import { describe, it, expect } from "vitest";
import { settingsTabs, SETTINGS_TAB_LABELS } from "@/app/admin/events/[id]/settings/tabs";
import { rememberedTab, tabCookieName } from "@/lib/remembered-tab";

const jarWith = (value: string) => ({
  get: (name: string) => (name === tabCookieName("settings:e1") ? { value } : undefined),
});

describe("settingsTabs (D778)", () => {
  it("shows an admin every tab in order", () => {
    expect(settingsTabs({ admin: true, hidden: [], verifying: true })).toEqual(["whats-on", "event", "look", "registration", "checkin", "committee", "verification", "address", "danger"]);
  });
  it("shows a committee member only their four tabs", () => {
    expect(settingsTabs({ admin: false, hidden: [], verifying: true })).toEqual(["event", "look", "registration", "checkin"]);
  });
  it("drops Address and Verification when the event has neither", () => {
    const tabs = settingsTabs({ admin: true, hidden: ["address"], verifying: false });
    expect(tabs).not.toContain("address");
    expect(tabs).not.toContain("verification");
  });
  it("keeps every tab when only the language or committee alerts parts are hidden", () => {
    expect(settingsTabs({ admin: true, hidden: ["language", "committee_alerts"], verifying: true })).toHaveLength(9);
  });
  it("opens on nothing remembered for an old tab key, so the page falls back to Event", () => {
    for (const old of ["details", "me", "alerts", "features", "checkpoints"]) {
      expect(rememberedTab(jarWith(old), "settings:e1", settingsTabs({ admin: true, hidden: [], verifying: true }))).toBeNull();
    }
  });
  it("labels every tab", () => {
    expect(SETTINGS_TAB_LABELS).toEqual({
      "whats-on": "What's on", event: "Event", look: "Portal look", registration: "Registration", checkin: "Check-in",
      committee: "Committee", verification: "Verification", address: "Address", danger: "Danger zone",
    });
  });
});
