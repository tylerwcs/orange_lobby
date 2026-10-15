import { describe, it, expect } from "vitest";
import { normaliseEmail, parseMember, linkExpiry, linkIsLive, memberStatus, passwordProblem, joinErrorCopy, LINK_DAYS } from "@/features/committee/lib/rules";

const now = new Date("2026-10-15T04:00:00Z"); // 12:00 in KL
const base = {
  id: "m1", event_id: "e1", name: "Aisyah", email: "aisyah@client.com", user_id: null, added_by: "a1",
  added_at: "2026-10-15T04:00:00Z", accepted_at: null, removed_at: null,
  link_token: "abcdefghjkmn", link_kind: "setup" as const, link_expires_at: "2026-10-22T04:00:00Z",
};

describe("normaliseEmail", () => {
  it("trims and lower-cases, so one person is one row and one login", () => {
    expect(normaliseEmail("  Ali@X.com ")).toBe("ali@x.com");
  });
});

describe("parseMember", () => {
  it("returns a tidy name and email", () => {
    expect(parseMember("  Aisyah  Rahman ", " Aisyah@Client.com")).toEqual({ name: "Aisyah Rahman", email: "aisyah@client.com" });
  });
  it("refuses a blank name, a long name, and a bad email", () => {
    expect(parseMember("", "a@b.co")).toEqual({ error: "Enter their name." });
    expect(parseMember("x".repeat(81), "a@b.co")).toEqual({ error: "Keep the name under 80 characters." });
    expect(parseMember("Ali", "ali@")).toEqual({ error: "Enter a valid email address." });
  });
});

describe("links", () => {
  it("expire LINK_DAYS after they are made", () => {
    expect(LINK_DAYS).toBe(7);
    expect(linkExpiry(now)).toBe("2026-10-22T04:00:00.000Z");
  });
  it("are live only with a token, before expiry, on a member not removed", () => {
    expect(linkIsLive(base, now)).toBe(true);
    expect(linkIsLive({ ...base, link_token: null }, now)).toBe(false);
    expect(linkIsLive(base, new Date("2026-10-22T04:00:00Z"))).toBe(false);
    expect(linkIsLive({ ...base, removed_at: "2026-10-16T00:00:00Z" }, now)).toBe(false);
  });
});

describe("memberStatus", () => {
  it("reads Invited, Link expired, Active, and Active with a reset link", () => {
    expect(memberStatus(base, now)).toBe("Invited · link expires 22 Oct");
    expect(memberStatus({ ...base, link_token: null }, now)).toBe("Link expired");
    const active = { ...base, user_id: "u1", accepted_at: "2026-10-16T02:00:00Z", link_token: null, link_kind: null, link_expires_at: null };
    expect(memberStatus(active, now)).toBe("Active since 16 Oct");
    expect(memberStatus({ ...active, link_token: "abcdefghjkmp", link_kind: "reset", link_expires_at: "2026-10-23T04:00:00Z" }, now))
      .toBe("Active since 16 Oct · reset link until 23 Oct");
  });
  it("uses the Malaysian date, not UTC, near midnight", () => {
    // 20 Oct 17:00 UTC is 21 Oct 01:00 in KL.
    expect(memberStatus({ ...base, link_expires_at: "2026-10-20T17:00:00Z" }, now)).toBe("Invited · link expires 21 Oct");
  });
});

describe("passwordProblem", () => {
  it("wants at least 8 characters, typed the same twice", () => {
    expect(passwordProblem("short", "short")).toBe("short");
    expect(passwordProblem("longenough", "longenougH")).toBe("mismatch");
    expect(passwordProblem("longenough", "longenough")).toBeNull();
  });
});

describe("joinErrorCopy", () => {
  it("has copy for every code and ignores anything else", () => {
    expect(joinErrorCopy("short")).toBe("Use at least 8 characters.");
    expect(joinErrorCopy("made-up")).toBeNull();
    expect(joinErrorCopy(undefined)).toBeNull();
  });
  it("ignores names that exist on every object, not just unknown ones", () => {
    expect(joinErrorCopy("toString")).toBeNull();
    expect(joinErrorCopy("constructor")).toBeNull();
  });
});
