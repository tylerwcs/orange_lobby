import { describe, it, expect } from "vitest";
import { safeFileName, buildLinksWorkbook, buildAttendanceWorkbook } from "@/lib/exports";

describe("exports", () => {
  it("makes safe unique png names", () => {
    expect(safeFileName("Ann Tan / VIP", "1a2b3c4d-0000")).toBe("ann-tan-vip-1a2b3c.png");
  });
  it("builds a links workbook with header + rows", async () => {
    const wb = buildLinksWorkbook([{ name: "A", email: "a@b.co", company: null, category: null, table_no: "1", seat_no: null, link: "https://x/e/s/a/t" }]);
    const ws = wb.getWorksheet("Links")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Company", "Category", "Table", "Seat", "Link"]);
    expect(ws.getRow(2).getCell(7).value).toBe("https://x/e/s/a/t");
  });
  it("builds attendance workbook with per-checkpoint columns", () => {
    const attendees = [{ id: "a1", name: "Ann", email: "a@b.co", phone: null, company: null, category: "VIP", table_no: "1", seat_no: null, source: "import", extra: { Dietary: "Halal" } }] as never;
    const cps = [{ id: "c1", name: "Day 1" }, { id: "c2", name: "Day 2" }] as never;
    const cis = [{ checkpoint_id: "c1", attendee_id: "a1", scanned_at: "2026-09-30T01:00:00Z", scanned_by: "u1" }] as never;
    const ws = buildAttendanceWorkbook(attendees, cps, cis, { u1: "crew@ecopia" }).getWorksheet("Attendance")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Phone", "Company", "Category", "Table", "Seat", "Source", "Dietary", "Day 1 checked in", "Day 1 time", "Day 1 scanned by", "Day 2 checked in", "Day 2 time", "Day 2 scanned by"]);
    const r = ws.getRow(2).values as unknown[];
    expect(r[10]).toBe("Yes"); expect(r[12]).toBe("crew@ecopia"); expect(r[13]).toBe("No");
  });
});
