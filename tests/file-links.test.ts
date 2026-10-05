import { describe, it, expect } from "vitest";
import { adminFileHref, portalFileHref } from "@/lib/file-links";
import { isOwnSubmissionPath } from "@/lib/storage";
import { canViewFile } from "@/lib/submissions";

const form = { orgId: "org1", eventId: "ev1", formId: "act1" };

describe("isOwnSubmissionPath (D399)", () => {
  it("accepts a file directly inside the form's own folder", () => {
    expect(isOwnSubmissionPath(form, "org1/ev1/act1/submission-ab12.jpg")).toBe(true);
  });

  it("refuses another form's file, a nested path, the bare folder, and typed text", () => {
    expect(isOwnSubmissionPath(form, "org1/ev1/act2/submission-ab12.jpg")).toBe(false);
    expect(isOwnSubmissionPath(form, "org1/ev1/act1/x/submission-ab12.jpg")).toBe(false);
    expect(isOwnSubmissionPath(form, "org1/ev1/act1/")).toBe(false);
    expect(isOwnSubmissionPath(form, "my receipt")).toBe(false);
  });
});

describe("canViewFile (D399)", () => {
  const me = { id: "me", group_id: "g1" };
  const entry = (over: Partial<{ attendee_id: string; submitted_by: string | null; group_id: string | null; status: "submitted" | "revoked" }>) =>
    ({ attendee_id: "other", submitted_by: null, group_id: null, status: "submitted" as const, ...over });

  it("lets an attendee see their own entry's files, revoked ones too (the tracker shows those)", () => {
    expect(canViewFile(entry({ attendee_id: "me" }), me)).toBe(true);
    expect(canViewFile(entry({ attendee_id: "me", status: "revoked" }), me)).toBe(true);
  });

  it("lets whoever added an entry for a group member see it (D392)", () => {
    expect(canViewFile(entry({ submitted_by: "me" }), me)).toBe(true);
  });

  it("lets a group see its members' live entries on a group form (D353), not revoked ones", () => {
    expect(canViewFile(entry({ group_id: "g1" }), me)).toBe(true);
    expect(canViewFile(entry({ group_id: "g1", status: "revoked" }), me)).toBe(false);
  });

  it("refuses anyone else's", () => {
    expect(canViewFile(entry({}), me)).toBe(false);
    expect(canViewFile(entry({ group_id: "g2" }), me)).toBe(false);
    expect(canViewFile(entry({ group_id: null }), { id: "me", group_id: null })).toBe(false);
  });
});

describe("file links (D399)", () => {
  it("name the entry and question, never the stored path", () => {
    expect(adminFileHref("ev1", "s1", "strava")).toBe("/admin/events/ev1/submissions/s1/files/strava");
    expect(portalFileHref("ecphub", "tok", "s1", "strava")).toBe("/e/ecphub/a/tok/files/s1/strava");
  });
});
