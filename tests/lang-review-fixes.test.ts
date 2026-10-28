import { describe, it, expect } from "vitest";
import { attendeeRevokeLabel } from "@/features/activities/lib/revoke";
import { richBlocks } from "@/components/portal/RichSections";

describe("review fixes in Bahasa Malaysia (D750)", () => {
  it("an activity description's first block is headed in the portal's language", () => {
    expect(richBlocks("<p>Please help</p>", "ms")[0].title).toBe("Tentang");
    expect(richBlocks("<p>Please help</p>")[0].title).toBe("About");
  });
  it("a removed entry's line is Malay around the organiser's own reason", () => {
    const s = { revoke_reason: "Duplicate", revoked_at: "2026-08-08T09:13:00Z" };
    expect(attendeeRevokeLabel(s, "history", "ms")).toBe("Dibuang pada 8 Ogo, 17:13: Duplicate");
    expect(attendeeRevokeLabel({ revoke_reason: null, revoked_at: s.revoked_at }, "history", "ms")).toBe("Dibuang oleh penganjur pada 8 Ogo, 17:13");
    expect(attendeeRevokeLabel(s, "history")).toBe("Removed on 8 Aug, 17:13: Duplicate");
  });
});
