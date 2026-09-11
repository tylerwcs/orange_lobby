import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMasterlist } from "@/lib/masterlist";

async function book(rows: (string | number | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
}

describe("parseMasterlist", () => {
  it("maps template columns and extra columns", async () => {
    const buf = await book([
      ["Name", "Email", "Phone", "Company", "Category", "Table", "Seat", "Dietary"],
      ["Ann Tan", "Ann@X.com", 60123, "Ecopia", "VIP", 12, "3", "Halal"],
      ["", "x@y.com", null, null, null, null, null, null],
      ["Bob", null, null, null, null, null, null, null],
    ]);
    const r = await parseMasterlist(buf);
    expect(r.extraColumns).toEqual(["Seat", "Dietary"]);
    expect(r.rows).toHaveLength(2);
    // Seat is no longer a field of its own, so the column lands in `extra` like any
    // other header the importer does not recognise.
    expect(r.rows[0]).toEqual({ row: 2, name: "Ann Tan", email: "ann@x.com", phone: "60123", company: "Ecopia", category: "VIP", table_no: "12", extra: { Dietary: "Halal", Seat: "3" } });
    expect(r.rows[1].email).toBeNull();
    expect(r.skipped).toEqual([{ row: 3, reason: "Name is blank" }]);
  });
  it("rejects a sheet without a Name header", async () => {
    await expect(parseMasterlist(await book([["Fullname"], ["x"]]))).rejects.toThrow(/Name/);
  });
});
