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
    expect(r.extraColumns).toEqual(["Phone", "Company", "Table", "Seat", "Dietary"]);
    expect(r.rows).toHaveLength(2);
    // Phone, Company and Table are ordinary fields now: with no event fields passed, they
    // fall through to their LEGACY_HEADERS spelling in `extra`, same as Seat and Dietary
    // fall through to their own header.
    expect(r.rows[0]).toEqual({
      row: 2, name: "Ann Tan", email: "ann@x.com", category: "VIP",
      extra: { phone: "60123", company: "Ecopia", table_no: "12", Seat: "3", Dietary: "Halal" },
    });
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

  it("files Mobile, Company and Table into extra like any other column", async () => {
    const buf = await book([
      ["Name", "Email", "Mobile", "Company", "Table", "Category"],
      ["Sam", "s@x.com", "012", "Ecopia", "7", "VIP"],
    ]);
    const res = await parseMasterlist(buf, [
      { key: "phone", label: "Mobile", type: "phone" },
      { key: "company", label: "Company", type: "text" },
      { key: "table_no", label: "Table", type: "text" },
    ]);
    expect(res.rows[0]).toMatchObject({
      name: "Sam",
      email: "s@x.com",
      category: "VIP",
      extra: { phone: "012", company: "Ecopia", table_no: "7" },
    });
    expect(res.rows[0]).not.toHaveProperty("phone");
  });
});
