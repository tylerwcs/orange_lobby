import { describe, expect, it } from "vitest";
import { parseVerifierName, resolveVerifier, belongsToLink, verifyQuery, verifyQueryString, approveCredit, VERIFY_FILE_LIMIT, VERIFY_PAGE_SIZE } from "@/features/activities/lib/verifier";
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

  // Final review: turning the Engagement add-on off hides the Verification tab, so a link the
  // admin can no longer see or remove must stop opening too.
  it("refuses a live link once its event no longer runs submissions", async () => {
    db.set("k7m2xq9rt4bd", link());
    expect(await resolveVerifier("k7m2xq9rt4bd", lookup, async () => false)).toBeNull();
    expect((await resolveVerifier("k7m2xq9rt4bd", lookup, async (eventId) => eventId === "e1"))?.name).toBe("Aisyah");
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

  it("keeps the Approved filter (D519)", () => {
    expect(verifyQuery({ status: "approved" }).status).toBe("approved");
    expect(verifyQueryString(verifyQuery({ status: "approved" }))).toBe("?status=approved");
  });

  it("writes back only what differs from the defaults", () => {
    expect(verifyQueryString(verifyQuery({}))).toBe("");
    expect(verifyQueryString(verifyQuery({ status: "all", q: "Ali" }), { page: 1 })).toBe("?status=all&q=Ali&page=1");
  });
});

// Final review: every thumbnail is a hit on the file route, so the limit must outlast a
// committee member paging steadily through two-photo entries (Project Active) for a minute.
describe("VERIFY_FILE_LIMIT", () => {
  it("covers 30 page loads a minute of two-photo entries", () => {
    expect(VERIFY_FILE_LIMIT).toBeGreaterThanOrEqual(VERIFY_PAGE_SIZE * 2 * 30);
  });
});

describe("approveCredit (D518)", () => {
  const at = "2026-10-14T02:05:00Z"; // 10:05 in Kuala Lumpur

  it("names the verifier and when", () => {
    expect(approveCredit({ status: "submitted", approved_at: at, approved_by_verifier: "v1" }, { v1: "Aisyah" })).toBe("Approved by Aisyah on 14 Oct, 10:05");
  });

  it("says a verifier when the link's name is gone", () => {
    expect(approveCredit({ status: "submitted", approved_at: at, approved_by_verifier: null }, {})).toBe("Approved by a verifier on 14 Oct, 10:05");
  });

  it("says an admin for an admin's Undo revoke, never their email (D735)", () => {
    expect(approveCredit({ status: "submitted", approved_at: at, approved_by_verifier: null, approved_by: "u1" }, {})).toBe("Approved by an admin on 14 Oct, 10:05");
  });

  it("is null for an entry nobody approved", () => {
    expect(approveCredit({ status: "submitted", approved_at: null, approved_by_verifier: null }, {})).toBeNull();
  });

  it("is null once revoked: the revoke is what the card says then", () => {
    expect(approveCredit({ status: "revoked", approved_at: at, approved_by_verifier: "v1" }, { v1: "Aisyah" })).toBeNull();
  });
});
