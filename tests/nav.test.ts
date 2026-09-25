import { describe, it, expect } from "vitest";
import { groupsFor } from "@/components/admin/nav";

const hrefs = (ev: Parameters<typeof groupsFor>[0]) =>
  groupsFor(ev).flatMap((g) => g.items.map((i) => i.href));

describe("groupsFor", () => {
  it("offers only the events list when there is no event", () => {
    expect(hrefs(null)).toEqual(["/admin/events"]);
  });

  it("carries the Scanner while check-in is on", () => {
    expect(hrefs({ id: "e1", check_in_enabled: true })).toContain("/scan/e1");
  });

  it("drops the Scanner when check-in is off", () => {
    expect(hrefs({ id: "e1", check_in_enabled: false })).not.toContain("/scan/e1");
  });

  it("keeps every other destination when check-in is off, so only the Scanner goes", () => {
    const on = hrefs({ id: "e1", check_in_enabled: true });
    const off = hrefs({ id: "e1", check_in_enabled: false });
    expect(off).toEqual(on.filter((h) => h !== "/scan/e1"));
  });

  it("orders the groups the way the sidebar reads", () => {
    const labels = groupsFor({ id: "e1", check_in_enabled: true }).map((g) => [g.title, g.items.map((i) => i.label)]);
    expect(labels).toEqual([
      ["Onsite", ["Overview", "Attendees", "Scanner"]],
      ["Portal", ["Agenda", "Info page", "Announcements", "Modules", "Activities"]],
      ["Event", ["WhatsApp", "Settings", "Exports"]],
    ]);
  });

  it("opens the Scanner in a new tab, and nothing else", () => {
    const items = groupsFor({ id: "e1", check_in_enabled: true }).flatMap((g) => g.items);
    expect(items.filter((i) => i.newTab).map((i) => i.href)).toEqual(["/scan/e1"]);
  });

  // Booths are a passport's children now (D190): they are reached through Activities.
  it("has no Booths item — booths live under their passport in Activities", () => {
    const all = hrefs({ id: "e1", check_in_enabled: true });
    expect(all).not.toContain("/admin/events/e1/booths");
    expect(all).toContain("/admin/events/e1/activities");
  });
});
