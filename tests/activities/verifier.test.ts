import { describe, expect, it } from "vitest";
import { parseVerifierName, resolveVerifier, belongsToLink, verifyQuery, verifyQueryString } from "@/features/activities/lib/verifier";
import type { VerifierLink } from "@/lib/types";

const link = (over: Partial<VerifierLink> = {}): VerifierLink => ({
  id: "v1", event_id: "e1", name: "Aisyah", token: "k7m2xq9rt4bd", created_by: null,
  created_at: "2026-10-13T00:00:00Z", removed_at: null, ...over,
});

describe("parseVerifierName", () => {
  it("collapses whitespace", () => expect(parseVerifierName("  Aisyah   Rahman ")).toEqual({ name: "Aisyah Rahman" }));
  it("refuses empty", () => expect(parseVerifierName("   ")).toEqual({ error: "Add their name." }));
  it("refuses over 60", () => expect(parseVerifierName("x".repeat(61))).toEqual({ error: "Keep the name to 60 characters or fewer." }));
});

// Review Focus 1: removed and replaced links stop at once.
describe("resolveVerifier (D496)", () => {
  const db = new Map<string, VerifierLink>();
  const lookup = async (t: string) => db.get(t) ?? null;

  it("refuses a malformed token without asking the database", async () => {
    let asked = false;
    expect(await resolveVerifier("nope", async () => { asked = true; return link(); })).toBeNull();
    expect(asked).toBe(false);
  });

  it("finds a live link", async () => {
    db.set("k7m2xq9rt4bd", link());
    expect((await resolveVerifier("k7m2xq9rt4bd", lookup))?.name).toBe("Aisyah");
  });

  it("refuses a removed link", async () => {
    db.set("k7m2xq9rt4bd", link({ removed_at: "2026-10-14T00:00:00Z" }));
    expect(await resolveVerifier("k7m2xq9rt4bd", lookup)).toBeNull();
  });

  it("refuses a replaced token: the row now carries another one", async () => {
    db.clear();
    db.set("k7m2xq9rt4bd", link({ token: "abcdefghjkmn" })); // a stale cache returning the row under its old key
    expect(await resolveVerifier("k7m2xq9rt4bd", lookup)).toBeNull();
  });

  it("refuses an unknown token", async () => {
    expect(await resolveVerifier("zzzzzzzzzzzz", lookup)).toBeNull();
  });
});

// Review Focus 2: a submission from another event is never theirs.
describe("belongsToLink", () => {
  it("is true only for the link's own event", () => {
    expect(belongsToLink(link(), { event_id: "e1" })).toBe(true);
    expect(belongsToLink(link(), { event_id: "e2" })).toBe(false);
    expect(belongsToLink(link(), null)).toBe(false);
  });
});

describe("verifyQuery", () => {
  it("defaults to To check, page 0", () => {
    expect(verifyQuery({})).toEqual({ activity: null, status: "submitted", q: "", page: 0 });
  });

  it("keeps known values and drops junk", () => {
    expect(verifyQuery({ activity: "a1", status: "revoked", q: " Ali ", page: "2" })).toEqual({ activity: "a1", status: "revoked", q: "Ali", page: 2 });
    expect(verifyQuery({ status: "deleted", page: "-1" })).toEqual({ activity: null, status: "submitted", q: "", page: 0 });
  });

  it("writes back only what differs from the defaults", () => {
    expect(verifyQueryString(verifyQuery({}))).toBe("");
    expect(verifyQueryString(verifyQuery({ status: "all", q: "Ali" }), { page: 1 })).toBe("?status=all&q=Ali&page=1");
  });
});
