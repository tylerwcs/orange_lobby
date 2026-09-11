import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMasterlist, extraKeyFor } from "@/lib/masterlist";
import type { AttendeeField } from "@/lib/attendee-fields";

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
  it("files a header that names one of the event's columns under that column's key", async () => {
    const fields: AttendeeField[] = [{ key: "dietary", label: "Dietary", type: "text" }];
    const buf = await book([["Name", "dietary", "Seat"], ["Ann", "Halal", "3"]]);
    const r = await parseMasterlist(buf, fields);
    // Matched case-insensitively against the label, so the import fills the column the
    // organiser already made rather than creating a near-duplicate beside it.
    expect(r.rows[0].extra).toEqual({ dietary: "Halal", Seat: "3" });
  });

  it("leaves headers alone when the event has no columns of its own", () => {
    expect(extraKeyFor("Dietary", [])).toBe("Dietary");
  });

  it("rejects a sheet without a Name header", async () => {
    await expect(parseMasterlist(await book([["Fullname"], ["x"]]))).rejects.toThrow(/Name/);
  });
});
