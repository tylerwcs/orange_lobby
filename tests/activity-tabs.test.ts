import { describe, expect, it } from "vitest";
import { activityHref, activityTabs, resolveTab } from "@/lib/activity-tabs";

describe("activityTabs", () => {
  it("gives a booking Setup, Bookings and Not booked, with a dot while requests wait", () => {
    expect(activityTabs("booking", { booked: 12, notBooked: 30, pendingRequests: 2 })).toEqual([
      { tab: "setup", label: "Setup", count: null, dot: false },
      { tab: "bookings", label: "Bookings", count: 12, dot: true },
      { tab: "not-booked", label: "Not booked", count: 30, dot: false },
    ]);
    expect(activityTabs("booking", { booked: 0, notBooked: 0, pendingRequests: 0 })[1].dot).toBe(false);
  });

  it("gives a submission Participation only when it runs per day", () => {
    const once = activityTabs("submission", { submissions: 4, notSubmitted: 9, perDay: false }).map((t) => t.tab);
    expect(once).toEqual(["setup", "submissions", "not-submitted"]);
    const daily = activityTabs("submission", { submissions: 4, notSubmitted: 9, perDay: true }).map((t) => t.tab);
    expect(daily).toEqual(["setup", "submissions", "not-submitted", "participation"]);
  });

  it("gives a passport Setup alone", () => {
    expect(activityTabs("passport", {}).map((t) => t.tab)).toEqual(["setup"]);
  });
});

describe("resolveTab", () => {
  const tabs = activityTabs("booking", { booked: 0, notBooked: 0 });
  it("takes a tab this kind has and falls back to Setup otherwise", () => {
    expect(resolveTab(tabs, "not-booked")).toBe("not-booked");
    expect(resolveTab(tabs, "participation")).toBe("setup");
    expect(resolveTab(tabs, undefined)).toBe("setup");
    expect(resolveTab(tabs, "nonsense")).toBe("setup");
  });
});

describe("activityHref", () => {
  it("leaves Setup bare, since it is the default, and carries other tabs and extras", () => {
    expect(activityHref("e", "a")).toBe("/admin/events/e/activities/a");
    expect(activityHref("e", "a", "setup")).toBe("/admin/events/e/activities/a");
    expect(activityHref("e", "a", "not-booked")).toBe("/admin/events/e/activities/a?tab=not-booked");
    expect(activityHref("e", "a", "not-submitted", { day: "2026-09-28" })).toBe("/admin/events/e/activities/a?tab=not-submitted&day=2026-09-28");
  });
});
