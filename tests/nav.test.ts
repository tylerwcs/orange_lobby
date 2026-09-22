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
});
