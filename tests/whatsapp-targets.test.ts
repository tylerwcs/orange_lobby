import { describe, it, expect } from "vitest";
import { audienceOptions, inAudience, sendKey } from "@/lib/whatsapp-targets";

const screening = { id: "a1", name: "Health Screening", categories: null };
const leaders = { id: "a2", name: "Leaders' lunch", categories: ["Management"] };
const booked = new Map([["a1", new Set(["p1"])]]);

describe("audienceOptions", () => {
  it("offers everyone, then booked and not yet booked per booking activity", () => {
    expect(audienceOptions([screening]).map((o) => o.label)).toEqual([
      "Everyone", "Booked for Health Screening", "Not yet booked for Health Screening",
    ]);
  });
});

describe("inAudience", () => {
  const acts = [screening, leaders];
  it("puts everybody in Everyone", () => {
    expect(inAudience("all", { id: "p9", category: null }, acts, booked)).toBe(true);
  });
  it("splits people by whether they booked", () => {
    expect(inAudience("booked:a1", { id: "p1", category: "Staff" }, acts, booked)).toBe(true);
    expect(inAudience("booked:a1", { id: "p2", category: "Staff" }, acts, booked)).toBe(false);
    expect(inAudience("unbooked:a1", { id: "p2", category: "Staff" }, acts, booked)).toBe(true);
    expect(inAudience("unbooked:a1", { id: "p1", category: "Staff" }, acts, booked)).toBe(false);
  });
  it("leaves people the activity is not offered to out of Not yet booked", () => {
    expect(inAudience("unbooked:a2", { id: "p2", category: "Staff" }, acts, booked)).toBe(false);
    expect(inAudience("unbooked:a2", { id: "p3", category: "Management" }, acts, booked)).toBe(true);
  });
  it("knows no audience for a deleted activity or a made-up key", () => {
    expect(inAudience("booked:gone", { id: "p1", category: null }, acts, booked)).toBeNull();
    expect(inAudience("vip:a1", { id: "p1", category: null }, acts, booked)).toBeNull();
  });
});

describe("sendKey", () => {
  const base = { template: "t", attendeeId: "p1", today: "2026-09-30" };
  it("keeps the old key for everyone, once, so earlier sends still count", () => {
    expect(sendKey({ ...base, audience: "all", again: false })).toBe("t:p1");
  });
  it("tells audiences apart, so one template can go out for two activities", () => {
    expect(sendKey({ ...base, audience: "unbooked:a1", again: false })).not.toBe(sendKey({ ...base, audience: "unbooked:a2", again: false }));
  });
  it("lets Send again go out once more each day", () => {
    const day1 = sendKey({ ...base, audience: "booked:a1", again: true });
    expect(day1).toBe(sendKey({ ...base, audience: "booked:a1", again: true }));
    expect(day1).not.toBe(sendKey({ ...base, audience: "booked:a1", again: true, today: "2026-10-01" }));
    expect(day1).not.toBe(sendKey({ ...base, audience: "booked:a1", again: false }));
  });
});
