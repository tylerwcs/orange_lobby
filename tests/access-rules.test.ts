import { describe, it, expect } from "vitest";
import { decideAccess, canSetStatus } from "@/lib/access-rules";

const ev = { id: "e1", org_id: "o1", status: "live" as const };
const seat = { event_id: "e1", user_id: "u1", removed_at: null };

describe("decideAccess", () => {
  it("lets an admin of the event's org in, archived or not", () => {
    expect(decideAccess({ userId: "u9", adminOrgId: "o1", ev, seats: [] })).toBe("admin");
    expect(decideAccess({ userId: "u9", adminOrgId: "o1", ev: { ...ev, status: "archived" }, seats: [] })).toBe("admin");
  });

  it("refuses an admin of another org", () => {
    expect(decideAccess({ userId: "u9", adminOrgId: "o2", ev, seats: [] })).toBeNull();
  });

  it("lets an active committee member of this event in, draft or live", () => {
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [seat] })).toBe("committee");
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev: { ...ev, status: "draft" }, seats: [seat] })).toBe("committee");
  });

  it("refuses a committee member once the event is archived (D556)", () => {
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev: { ...ev, status: "archived" }, seats: [seat] })).toBeNull();
  });

  it("refuses a removed member, another event's member, and a seat for someone else", () => {
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [{ ...seat, removed_at: "2026-10-15T00:00:00Z" }] })).toBeNull();
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [{ ...seat, event_id: "e2" }] })).toBeNull();
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [{ ...seat, user_id: "u2" }] })).toBeNull();
  });
});

describe("canSetStatus (D553)", () => {
  it("lets the committee publish and unpublish, but only an admin archive", () => {
    expect(canSetStatus("committee", "draft")).toBe(true);
    expect(canSetStatus("committee", "live")).toBe(true);
    expect(canSetStatus("committee", "archived")).toBe(false);
    expect(canSetStatus("admin", "archived")).toBe(true);
  });
});
