import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMasterlist, extraKeyFor, importedColumns } from "@/lib/masterlist";
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
    // Phone and Table are ordinary fields now, but keep a LEGACY_HEADERS spelling so a
    // client's existing template still imports. Company has no such spelling any more, so
    // with no event fields passed it falls through to its own header, like Seat and Dietary.
    expect(r.rows[0]).toEqual({
      row: 2, name: "Ann Tan", email: "ann@x.com", category: "VIP",
      extra: { phone: "60123", Company: "Ecopia", table_no: "12", Seat: "3", Dietary: "Halal" },
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

  it("has no legacy spelling left for company, so an undefined Company column keeps its header", async () => {
    // An event that defines Company still collects it by label match (the test above); one
    // that does not gets the value stored verbatim and offered in the "add a column"
    // suggestions, which is what happens to every other unrecognised header.
    const buf = await book([["Name", "Company"], ["Sam", "Ecopia"]]);
    expect((await parseMasterlist(buf)).rows[0].extra).toEqual({ Company: "Ecopia" });
  });

  it("falls back to the mobile and table-no legacy spellings when the event has no fields of its own", async () => {
    const buf = await book([
      ["Name", "Mobile", "Table No"],
      ["Sam", "012", "7"],
    ]);
    const res = await parseMasterlist(buf);
    expect(res.rows[0].extra).toEqual({ phone: "012", table_no: "7" });
  });

  it("matches a header to a column by its key as well as its label", async () => {
    const fields: AttendeeField[] = [{ key: "phone_number", label: "Mobile no", type: "phone" }];
    const buf = await book([["Name", "Phone Number"], ["Ann", "0123456789"]]);
    expect((await parseMasterlist(buf, fields)).rows[0].extra).toEqual({ phone_number: "0123456789" });
  });
});

describe("importedColumns", () => {
  it("files a Phone or Mobile header under the event's own phone column, whatever it is called", async () => {
    // The WhatsApp send reads the event's phone column. A "Phone" header stored under
    // `phone` beside a "Phone number" column would leave that column empty for everyone.
    const fields: AttendeeField[] = [{ key: "phone_number", label: "Phone number", type: "phone" }];
    const buf = await book([["Name", "Phone"], ["Ann", "60123456789"]]);
    const res = await parseMasterlist(buf, fields);
    expect(res.rows[0].extra).toEqual({ phone_number: "60123456789" });
    expect(importedColumns(res.extraColumns, fields)).toEqual([]);
  });

  const nickname: AttendeeField = { key: "nickname", label: "Nickname", type: "text" };

  it("makes a column of every header no column claims, keyed where the values are stored", () => {
    const cols = importedColumns(["Nickname", "Room Partner", "Department / Team"], [nickname]);
    // Keyed by the header verbatim, because that is the key parseMasterlist stored the value
    // under — so the column arrives filled without moving a single value.
    expect(cols).toEqual([
      { key: "Room Partner", label: "Room Partner", type: "text" },
      { key: "Department / Team", label: "Department / Team", type: "text" },
    ]);
  });

  it("gives a legacy Mobile header the phone key and type, so a WhatsApp send can read it", () => {
    expect(importedColumns(["Mobile", "Table No"], [])).toEqual([
      { key: "phone", label: "Mobile", type: "phone" },
      { key: "table_no", label: "Table No", type: "text" },
    ]);
  });

  it("skips breakout rounds, built-in columns and repeats", () => {
    const cols = importedColumns(["Breakout 1", "Source", "Checked in", "Seat", "seat"], [], ["breakout 1"]);
    // A round already has a column of its own, and its values must stay under the round
    // name for room assignment; Source and Checked in would shadow the built-ins.
    expect(cols).toEqual([{ key: "Seat", label: "Seat", type: "text" }]);
  });

  it("round-trips: every imported column finds its values on the parsed rows", async () => {
    const buf = await book([["Name", "Room Partner", "Mobile"], ["Ann", "Bee", "012"]]);
    const res = await parseMasterlist(buf);
    const cols = importedColumns(res.extraColumns, []);
    expect(cols.map((c) => res.rows[0].extra[c.key])).toEqual(["Bee", "012"]);
  });
});
