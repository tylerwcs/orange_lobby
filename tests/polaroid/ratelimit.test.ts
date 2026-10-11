import { describe, expect, it } from "vitest";
import { waitSeconds, HOUR_MS } from "@/features/polaroid/lib/ratelimit";

const NOW = Date.parse("2026-10-11T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const post = (msAgo: number, over: Partial<{ attendee_id: string | null; client_key: string; ip_hash: string }> = {}) =>
  ({ created_at: ago(msAgo), attendee_id: null, client_key: "dev-a", ip_hash: "ip-1", ...over });
const walkIn = { attendeeId: null, clientKey: "dev-a", ipHash: "ip-1" };
const portal = { attendeeId: "att-1", clientKey: "dev-z", ipHash: "ip-9" };

describe("waitSeconds (D480)", () => {
  it("lets a first post through", () => {
    expect(waitSeconds([], walkIn, NOW)).toBe(0);
  });
  it("spaces one device's posts 30 s apart", () => {
    expect(waitSeconds([post(10_000)], walkIn, NOW)).toBe(20);
    expect(waitSeconds([post(31_000)], walkIn, NOW)).toBe(0);
  });
  it("spaces one attendee's posts across devices", () => {
    expect(waitSeconds([post(5_000, { attendee_id: "att-1", client_key: "dev-b" })], portal, NOW)).toBe(25);
  });
  it("caps a walk-in device at 10 an hour, freeing a slot when the oldest ages out", () => {
    // Ten posts, the oldest 59 min ago: the next is allowed in 1 min.
    const ten = Array.from({ length: 10 }, (_, i) => post(HOUR_MS - 60_000 - i * 60_000));
    expect(waitSeconds(ten, walkIn, NOW)).toBe(60);
  });
  it("caps one IP's walk-ins at 30 an hour across devices", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => post(HOUR_MS - 120_000 - i * 1000, { client_key: `dev-${i}` }));
    expect(waitSeconds(thirty, { attendeeId: null, clientKey: "dev-new", ipHash: "ip-1" }, NOW)).toBe(120);
  });
  it("does not hold portal attendees to the hourly caps, or count their posts against the IP", () => {
    const many = Array.from({ length: 40 }, (_, i) => post(60_000 + i * 60_000, { attendee_id: `att-${i + 2}`, client_key: `dev-${i}` }));
    expect(waitSeconds(many, portal, NOW)).toBe(0);
    expect(waitSeconds(many, { attendeeId: null, clientKey: "dev-new", ipHash: "ip-1" }, NOW)).toBe(0);
  });
});
