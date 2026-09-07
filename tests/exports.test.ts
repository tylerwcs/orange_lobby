import { describe, it, expect } from "vitest";
import { safeFileName, buildLinksWorkbook } from "@/lib/exports";

describe("exports", () => {
  it("makes safe unique png names", () => {
    expect(safeFileName("Ann Tan / VIP", "1a2b3c4d-0000")).toBe("ann-tan-vip-1a2b3c.png");
  });
  it("builds a links workbook with header + rows", async () => {
    const wb = buildLinksWorkbook([{ name: "A", email: "a@b.co", company: null, category: null, table_no: "1", seat_no: null, link: "https://x/e/s/a/t" }]);
    const ws = wb.getWorksheet("Links")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Company", "Category", "Table", "Seat", "Link"]);
    expect(ws.getRow(2).getCell(8).value).toBe("https://x/e/s/a/t");
  });
});
