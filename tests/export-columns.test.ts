import { describe, expect, it } from "vitest";
import { exportColumns, exportFieldsFromForm } from "@/lib/export-columns";
import {
  buildLinksWorkbook, buildRosterWorkbook, buildActivityRostersWorkbook, buildPassportWorkbook, buildFormsWorkbook,
} from "@/lib/exports";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { Booth } from "@/lib/types";

const fields: AttendeeField[] = [
  { key: "nickname", label: "Nickname", type: "text" },
  { key: "table_no", label: "Table", type: "text" },
  { key: "dietary", label: "Dietary", type: "text" },
];
const nickname = [{ key: "nickname", label: "Nickname" }];

describe("exportColumns", () => {
  it("resolves the chosen keys to the event's fields, in the order they were chosen", () => {
    expect(exportColumns(fields, ["dietary", "nickname"])).toEqual([
      { key: "dietary", label: "Dietary" }, { key: "nickname", label: "Nickname" },
    ]);
  });

  it("quietly drops a key whose field has since been deleted", () => {
    expect(exportColumns(fields, ["gone", "nickname"])).toEqual(nickname);
  });

  it("drops a key the export already carries as a fixed column", () => {
    expect(exportColumns(fields, ["table_no", "nickname"], ["table_no"])).toEqual(nickname);
  });
});

describe("exportFieldsFromForm", () => {
  it("keeps only real field keys, once each, in the posted order", () => {
    expect(exportFieldsFromForm(["dietary", "nope", "nickname", "dietary", " "], fields)).toEqual(["dietary", "nickname"]);
  });
});

describe("chosen columns in each export", () => {
  const extra = { nickname: "Annie", table_no: "7" };

  it("Personal links: after Table, before Link", () => {
    const ws = buildLinksWorkbook([{ name: "Ann", email: "a@b.co", category: "VIP", table_no: "7", link: "https://x/l", extra }], nickname).getWorksheet("Links")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Table", "Nickname", "Link"]);
    expect(ws.getRow(2).getCell(5).value).toBe("Annie");
    expect(ws.getRow(2).getCell(6).value).toEqual({ text: "https://x/l", hyperlink: "https://x/l" });
  });

  it("Breakout rosters: after Email on every room sheet", () => {
    const people = new Map([["p1", { name: "Ann", email: "a@b.co", extra }], ["p2", { name: "Bo", email: null, extra: null }]]);
    const slots = [{ slot: "B1", rooms: [{ slot: "B1", code: "3A", title: "", location: "", attendeeIds: ["p1"] }], unassignedIds: ["p2"] }];
    const wb = buildRosterWorkbook(slots, people, nickname);
    expect(wb.getWorksheet("B1 · 3A")!.getRow(1).values).toEqual([undefined, "Name", "Email", "Nickname"]);
    expect(wb.getWorksheet("B1 · 3A")!.getRow(2).values).toEqual([undefined, "Ann", "a@b.co", "Annie"]);
    // No value (or no extra at all) is a blank cell, not the word undefined.
    expect(wb.getWorksheet("B1 · unassigned")!.getRow(2).getCell(3).value).toBe("");
  });

  it("Activity rosters: after Email on session and not-booked sheets", () => {
    const people = new Map([["p1", { name: "Ann", email: "a@b.co", extra }]]);
    const wb = buildActivityRostersWorkbook(
      [{ activityName: "Yoga", session: "AM", attendeeIds: ["p1"] }],
      [{ activityName: "Yoga", attendeeIds: ["p1"] }],
      people, nickname,
    );
    for (const name of ["Yoga — AM", "Yoga — Not booked"]) {
      expect(wb.getWorksheet(name)!.getRow(1).values).toEqual([undefined, "Name", "Email", "Nickname"]);
      expect(wb.getWorksheet(name)!.getRow(2).values).toEqual([undefined, "Ann", "a@b.co", "Annie"]);
    }
  });

  it("Booth Passport: after Category, before the booths", () => {
    const booths: Booth[] = [{ id: "b1", org_id: "o", event_id: "e", activity_id: "p", name: "Ops", location: null, token: "t", sort_order: 0 }];
    const attendees = [{ id: "a1", name: "Ann", email: "a@b.co", category: "VIP", extra }] as unknown as Parameters<typeof buildPassportWorkbook>[0];
    const ws = buildPassportWorkbook(attendees, [{ name: "Passport", booths, required: null }], [], nickname).getWorksheet("Passport")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Nickname", "Ops", "Stamps", "Completed"]);
    expect(ws.getRow(2).values).toEqual([undefined, "Ann", "a@b.co", "VIP", "Annie", "No", 0, "No"]);
  });

  it("Submissions: after Category on both the answers and not-submitted sheets, with file links still in place", () => {
    const url = "https://x/sign/a.png";
    const wb = buildFormsWorkbook([{
      formName: "Receipts",
      questions: [{ key: "receipt", label: "Receipt", file: true }],
      rows: [{ name: "Ann", email: "a@b.co", category: "VIP", submittedOn: "d", createdAt: "t", answers: { receipt: url }, extra }],
      missing: [{ name: "Bo", email: null, category: null, extra: { nickname: "Bobo" } }],
    }], nickname);
    const answers = wb.getWorksheet("Receipts")!;
    expect(answers.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Nickname", "Submitted", "Timestamp", "Receipt"]);
    expect(answers.getRow(2).getCell(4).value).toBe("Annie");
    expect(answers.getRow(2).getCell(7).value).toEqual({ text: "Open file", hyperlink: url });
    const missing = wb.worksheets[1];
    expect(missing.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Nickname"]);
    expect(missing.getRow(2).values).toEqual([undefined, "Bo", "", "", "Bobo"]);
  });
});
