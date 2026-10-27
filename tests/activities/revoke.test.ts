import { describe, expect, it } from "vitest";
import {
  OTHER, PICK_ERROR, TOO_LONG_ERROR, reasonsOf, parseRevokeReason, parseReasonList, revokeCredit, attendeeRevokeLabel,
  restoreCredit, restoreRefusal,
} from "@/features/activities/lib/revoke";

const T = ["Photo or file is unclear", "Duplicate entry"];
const fd = (entries: Record<string, string>) => ({ get: (k: string) => entries[k] ?? null });

describe("reasonsOf (D497)", () => {
  it("is the event's list", () => expect(reasonsOf({ revoke_reasons: T })).toEqual(T));
  it("is empty when the column is missing", () => expect(reasonsOf({})).toEqual([]));
});

describe("parseRevokeReason (D498)", () => {
  it("accepts a template", () => {
    expect(parseRevokeReason(fd({ reason: "Duplicate entry" }), T)).toEqual({ reason: "Duplicate entry" });
  });

  it("accepts Other with text, whitespace collapsed", () => {
    expect(parseRevokeReason(fd({ reason: OTHER, other: "  Selfie   is\nmissing " }), T)).toEqual({ reason: "Selfie is missing" });
  });

  it("refuses nothing picked", () => {
    expect(parseRevokeReason(fd({}), T)).toEqual({ error: PICK_ERROR });
  });

  it("refuses Other left empty or all whitespace", () => {
    expect(parseRevokeReason(fd({ reason: OTHER, other: "   \n " }), T)).toEqual({ error: PICK_ERROR });
  });

  // Review Focus 3: the admin edited the list while the dialog was open.
  it("refuses a template that is no longer in the list, rather than saving it as free text", () => {
    expect(parseRevokeReason(fd({ reason: "Blurry photo" }), T)).toEqual({ error: PICK_ERROR });
  });

  // Review Focus 4: Postgres char_length counts code points, so this must too.
  it("counts code points, not UTF-16 units", () => {
    expect(parseRevokeReason(fd({ reason: OTHER, other: "🏃".repeat(300) }), T)).toEqual({ reason: "🏃".repeat(300) });
    expect(parseRevokeReason(fd({ reason: OTHER, other: "🏃".repeat(301) }), T)).toEqual({ error: TOO_LONG_ERROR });
  });
});

describe("parseReasonList (D497)", () => {
  it("reads one reason per line, skipping blank lines", () => {
    expect(parseReasonList("Duplicate entry\n\n  Photo  unclear \r\n")).toEqual({ reasons: ["Duplicate entry", "Photo unclear"] });
  });

  it("allows an empty list (only Other is offered)", () => {
    expect(parseReasonList("  \n ")).toEqual({ reasons: [] });
  });

  it("refuses a duplicate, ignoring case", () => {
    expect(parseReasonList("Duplicate entry\nduplicate ENTRY")).toEqual({ error: "\"duplicate ENTRY\" is in the list twice." });
  });

  it("refuses more than 12", () => {
    const lines = Array.from({ length: 13 }, (_, i) => `Reason ${i + 1}`).join("\n");
    expect(parseReasonList(lines)).toEqual({ error: "Keep it to 12 reasons or fewer." });
  });

  it("refuses a line over 300 characters", () => {
    expect(parseReasonList("x".repeat(301))).toEqual({ error: "Keep each reason to 300 characters or fewer." });
  });
});

describe("revokeCredit (D492)", () => {
  const names = { admins: { u1: "cs.wong@ecopiaevents.com" }, verifiers: { v1: "Aisyah" } };
  const at = "2026-10-13T07:42:00Z";

  it("names a verifier and the reason", () => {
    expect(revokeCredit({ revoked_at: at, revoked_by: null, revoked_by_verifier: "v1", revoke_reason: "Duplicate entry" }, names))
      .toMatch(/^Revoked by Aisyah \(verifier\) on .+ · Duplicate entry$/);
  });

  it("names an admin by email, and keeps today's wording with no reason", () => {
    expect(revokeCredit({ revoked_at: at, revoked_by: "u1", revoked_by_verifier: null, revoke_reason: null }, names))
      .toMatch(/^Revoked by cs\.wong@ecopiaevents\.com on [^·]+$/);
  });

  it("falls back when a name can't be resolved", () => {
    expect(revokeCredit({ revoked_at: null, revoked_by: "gone", revoked_by_verifier: null }, names)).toBe("Revoked by an admin");
    expect(revokeCredit({ revoked_at: null, revoked_by: null, revoked_by_verifier: "gone" }, names)).toBe("Revoked by a verifier");
  });
});

describe("restoreCredit (D735)", () => {
  const names = { admins: { u1: "cs.wong@ecopiaevents.com" }, verifiers: { v1: "Aisyah" } };
  const at = "2026-10-27T03:30:00Z"; // 11:30 in Malaysia

  it("names who undid the revoke and when", () => {
    expect(restoreCredit({ restored_at: at, restored_by: "u1", restored_by_verifier: null }, names)).toBe("Restored by cs.wong@ecopiaevents.com on 27 Oct, 11:30");
    expect(restoreCredit({ restored_at: at, restored_by: null, restored_by_verifier: "v1" }, names)).toBe("Restored by Aisyah (verifier) on 27 Oct, 11:30");
  });

  it("falls back when a name can't be resolved", () => {
    expect(restoreCredit({ restored_at: at, restored_by: null, restored_by_verifier: "gone" }, names)).toBe("Restored by a verifier on 27 Oct, 11:30");
    expect(restoreCredit({ restored_at: at, restored_by: null, restored_by_verifier: null }, names)).toBe("Restored by an admin on 27 Oct, 11:30");
  });

  it("is null for an entry never restored", () => {
    expect(restoreCredit({ restored_at: null }, names)).toBeNull();
    expect(restoreCredit({}, names)).toBeNull();
  });
});

describe("restoreRefusal (D735)", () => {
  it("says what to revoke first for each limit", () => {
    for (const code of ["today", "limit", "groupdone", "trackfull"] as const) expect(restoreRefusal(code)).toMatch(/Revoke/);
    expect(restoreRefusal("missing")).toBe("That entry isn't revoked any more.");
  });
});

describe("attendeeRevokeLabel (D500)", () => {
  const at = "2026-10-18T06:15:00Z"; // 14:15 in Malaysia

  it("says why and when in the history and the tracker", () => {
    expect(attendeeRevokeLabel({ revoke_reason: "Duplicate entry", revoked_at: at }, "history")).toBe("Removed on 18 Oct, 14:15: Duplicate entry");
    expect(attendeeRevokeLabel({ revoke_reason: "Duplicate entry", revoked_at: at }, "tracker")).toBe("Removed by the organiser on 18 Oct, 14:15: Duplicate entry");
  });

  it("keeps the old wording for revokes with no reason, still with when", () => {
    expect(attendeeRevokeLabel({ revoke_reason: null, revoked_at: at }, "history")).toBe("Removed by the organiser on 18 Oct, 14:15");
    expect(attendeeRevokeLabel({ revoked_at: at }, "tracker")).toBe("Removed by the organiser on 18 Oct, 14:15");
  });

  it("leaves the time out when there is none", () => {
    expect(attendeeRevokeLabel({ revoke_reason: "Duplicate entry", revoked_at: null }, "history")).toBe("Removed: Duplicate entry");
  });
});
