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
      ["Onsite", ["Overview", "Attendees", "Groups", "Games", "Scanner"]],
      ["Portal", ["Agenda", "Info page", "Announcements", "Modules", "Activities"]],
      ["Event", ["Setup", "WhatsApp", "Settings", "Exports"]],
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

  it("leaves out the items it is told to hide, and nothing else (D438)", () => {
    const shown = groupsFor({ id: "e1", check_in_enabled: true }, ["whatsapp", "games"]).flatMap((g) => g.items.map((i) => i.label));
    expect(shown).not.toContain("WhatsApp");
    expect(shown).not.toContain("Games");
    expect(shown).toContain("Activities");
    expect(shown).toContain("Settings");
  });

  it("hides Activities on request, keeping the rest of Portal in order", () => {
    const portal = groupsFor({ id: "e1", check_in_enabled: true }, ["activities"]).find((g) => g.title === "Portal");
    expect(portal?.items.map((i) => i.label)).toEqual(["Agenda", "Info page", "Announcements", "Modules"]);
  });

  it("puts Setup first under Event, with the waiting count as its badge (D448)", () => {
    const event = groupsFor({ id: "e1", check_in_enabled: true }, [], { setup: 2 }).find((g) => g.title === "Event");
    expect(event?.items[0]).toMatchObject({ href: "/admin/events/e1/setup", label: "Setup", badge: 2 });
  });

  it("shows no badge when nothing is waiting", () => {
    const event = groupsFor({ id: "e1", check_in_enabled: true }).find((g) => g.title === "Event");
    expect(event?.items[0].badge).toBeUndefined();
  });
});
