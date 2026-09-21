import { describe, it, expect } from "vitest";
import { buildLinksWorkbook, buildAttendanceWorkbook, attendanceExtraColumns, attendeeSheetRow, buildRosterWorkbook, rosterSheetName, buildPassportWorkbook, buildActivityRostersWorkbook, activitySheetName, activityUnbookedSheetName } from "@/lib/exports";
import { safeFileName } from "@/lib/filenames";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { Booth, BoothStamp } from "@/lib/types";

describe("exports", () => {
  it("makes safe unique png names", () => {
    expect(safeFileName("Ann Tan / VIP", "1a2b3c4d-0000")).toBe("ann-tan-vip-1a2b3c.png");
  });
  it("builds a links workbook with header + rows", async () => {
    const wb = buildLinksWorkbook([{ name: "A", email: "a@b.co", category: null, table_no: "1", link: "https://x/e/s/a/t" }]);
    const ws = wb.getWorksheet("Links")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Table", "Link"]);
    expect(ws.getRow(2).getCell(5).value).toBe("https://x/e/s/a/t");
  });
  it("builds attendance workbook with per-checkpoint columns", () => {
    const attendees = [{ id: "a1", name: "Ann", email: "a@b.co", phone: null, company: null, category: "VIP", table_no: "1", source: "import", extra: { Dietary: "Halal" } }] as never;
    const cps = [{ id: "c1", name: "Day 1" }, { id: "c2", name: "Day 2" }] as never;
    const cis = [{ checkpoint_id: "c1", attendee_id: "a1", scanned_at: "2026-09-30T01:00:00Z", scanned_by: "u1" }] as never;
    const ws = buildAttendanceWorkbook(attendees, cps, cis, { u1: "crew@ecopia" }).getWorksheet("Attendance")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Phone", "Category", "Table", "Source", "Dietary", "Day 1 checked in", "Day 1 time", "Day 1 scanned by", "Day 2 checked in", "Day 2 time", "Day 2 scanned by"]);
    const r = ws.getRow(2).values as unknown[];
    expect(r[8]).toBe("Yes"); expect(r[10]).toBe("crew@ecopia"); expect(r[11]).toBe("No");
  });

  it("leads with the event's own columns under their labels, then anything else in extra", () => {
    const fields: AttendeeField[] = [{ key: "room_no", label: "Room number", type: "text" }];
    const attendees = [{ extra: { Seat: "3", room_no: "12A" } }];
    expect(attendanceExtraColumns(attendees, fields)).toEqual([
      { key: "room_no", label: "Room number" },
      { key: "Seat", label: "Seat" },
    ]);
  });

  it("carries a defined column even when nobody has filled it in yet", () => {
    const fields: AttendeeField[] = [{ key: "flight", label: "Flight", type: "text" }];
    expect(attendanceExtraColumns([{ extra: {} }], fields)).toEqual([{ key: "flight", label: "Flight" }]);
  });

  it("writes a renamed column under its new label without losing the values", () => {
    const fields: AttendeeField[] = [{ key: "room_no", label: "Room number", type: "text" }];
    const attendees = [{ id: "a1", name: "Ann", email: null, phone: null, company: null, category: null, table_no: null, source: "import", extra: { room_no: "12A" } }] as never;
    const ws = buildAttendanceWorkbook(attendees, [] as never, [] as never, {}, fields).getWorksheet("Attendance")!;
    expect(ws.getRow(1).getCell(7).value).toBe("Room number");
    expect(ws.getRow(2).getCell(7).value).toBe("12A");
  });

  it("keeps the sheet's fixed columns, which no longer include company", () => {
    const rows = [{ name: "Sam", email: "s@x.com", category: "VIP", extra: { phone: "012", company: "Ecopia", table_no: "7" } }] as never[];
    expect(attendeeSheetRow(rows[0], [])).toEqual(["Sam", "s@x.com", "012", "VIP", "7", undefined]);
  });

  it("excludes phone and table_no from the extras block once they are fields, so nothing doubles up", () => {
    const fields: AttendeeField[] = [
      { key: "phone", label: "Phone", type: "phone" },
      { key: "table_no", label: "Table", type: "text" },
      { key: "flight", label: "Flight", type: "text" },
    ];
    expect(attendanceExtraColumns([{ extra: {} }], fields)).toEqual([{ key: "flight", label: "Flight" }]);
  });

  it("carries company through the extras block like any other defined column", () => {
    // Company has no fixed column any more, so the only thing that can put it on the sheet
    // is the ordinary path every other field takes - under the label the event gave it.
    const fields: AttendeeField[] = [{ key: "company", label: "Employer", type: "text" }];
    expect(attendanceExtraColumns([{ extra: { company: "Ecopia" } }], fields)).toEqual([{ key: "company", label: "Employer" }]);
  });

  it("carries an undeclared company value under its raw key, same as any other stray header", () => {
    expect(attendanceExtraColumns([{ extra: { company: "Ecopia" } }], [])).toEqual([{ key: "company", label: "company" }]);
  });
});

describe("roster workbook", () => {
  const people = new Map([
    ["p1", { name: "Ann Tan", email: "a@b.co" }],
    ["p2", { name: "Bryan Koh", email: null }],
  ]);
  const slots = [{
    slot: "Breakout 1",
    rooms: [{ slot: "Breakout 1", code: "3A", title: "Regional teams", location: "Room 3A", attendeeIds: ["p1"] }],
    unassignedIds: ["p2"],
  }];

  it("gives each room its own sheet, headed and filled", () => {
    const wb = buildRosterWorkbook(slots, people);
    const ws = wb.getWorksheet("Breakout 1 · 3A")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email"]);
    expect(ws.getRow(2).getCell(1).value).toBe("Ann Tan");
  });

  it("puts the people with no room on their own sheet", () => {
    const ws = buildRosterWorkbook(slots, people).getWorksheet("Breakout 1 · unassigned")!;
    expect(ws.getRow(2).getCell(1).value).toBe("Bryan Koh");
  });

  it("keeps sheet names legal and unique", () => {
    // Excel forbids : \\ / ? * [ ] and caps a sheet name at 31 characters.
    const taken = new Set<string>();
    const first = rosterSheetName("Breakout 1 / afternoon session", "3A", taken);
    taken.add(first);
    expect(first).not.toMatch(/[:\\/?*\[\]]/);
    expect(first.length).toBeLessThanOrEqual(31);
    expect(rosterSheetName("Breakout 1 / afternoon session", "3A", taken)).not.toBe(first);
  });

  it("strips every character Excel forbids from a sheet name", () => {
    // : \ / ? * [ ] all appear across the slot and code — every one must be gone.
    const taken = new Set<string>();
    const name = rosterSheetName("Room: A\\B/C?D", "[3*A]", taken);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });

  it("treats sheet names that differ only in case as a collision, like ExcelJS itself does", () => {
    // ExcelJS lowercases both sides of its own duplicate-name check (worksheet.js), so two
    // rooms named "Morning" and "morning" would otherwise pass this check and throw inside
    // addWorksheet, failing the whole download.
    const taken = new Set<string>();
    const first = rosterSheetName("Round 1", "Morning", taken);
    const second = rosterSheetName("Round 1", "morning", taken);
    expect(second.toLowerCase()).not.toBe(first.toLowerCase());
  });

  it("gives two rooms distinct names even when their full names collide only after truncation", () => {
    // Both rooms share a slot name so long that it alone fills the 31-character limit, so the
    // untruncated names differ (different code) but the naive truncation would be identical.
    const slot = "Breakout 1 / afternoon session for regional teams";
    const taken = new Set<string>();
    const first = rosterSheetName(slot, "3A", taken);
    taken.add(first);
    const second = rosterSheetName(slot, "3B", taken);
    expect(second).not.toBe(first);
    expect(second.length).toBeLessThanOrEqual(31);
    expect(second).not.toMatch(/[:\\/?*[\]]/);
  });
});

describe("buildPassportWorkbook", () => {
  const booths: Booth[] = [
    { id: "b1", org_id: "o", event_id: "e", name: "Operations", location: "Foyer", token: "t1", sort_order: 0 },
    { id: "b2", org_id: "o", event_id: "e", name: "Creative Studio", location: "Foyer", token: "t2", sort_order: 1 },
  ];
  const stamps: BoothStamp[] = [
    { id: "s1", org_id: "o", event_id: "e", booth_id: "b1", attendee_id: "a1", stamped_at: "2026-09-30T02:24:00Z" },
    { id: "s2", org_id: "o", event_id: "e", booth_id: "b2", attendee_id: "a1", stamped_at: "2026-09-30T02:41:00Z" },
  ];
  const attendees = [
    { id: "a1", name: "Aiman Zulkifli", email: "a@x.my", category: "Management", extra: { company: "Ecopia" } },
    { id: "a2", name: "Sarah Lim", email: "s@x.my", category: "Crew", extra: { company: "Ecopia" } },
  ] as unknown as Parameters<typeof buildPassportWorkbook>[0];

  it("writes a column per booth plus a total and a completed flag", () => {
    const ws = buildPassportWorkbook(attendees, booths, stamps, null).getWorksheet("Booth Passport")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Operations", "Creative Studio", "Stamps", "Completed"]);
  });

  it("marks who has been where, and who has finished", () => {
    const ws = buildPassportWorkbook(attendees, booths, stamps, null).getWorksheet("Booth Passport")!;
    expect(ws.getRow(2).values).toEqual([undefined, "Aiman Zulkifli", "a@x.my", "Management", "Yes", "Yes", 2, "Yes"]);
    expect(ws.getRow(3).values).toEqual([undefined, "Sarah Lim", "s@x.my", "Crew", "No", "No", 0, "No"]);
  });

  it("honours a target below the booth count", () => {
    const ws = buildPassportWorkbook(attendees, booths, stamps.slice(0, 1), 1).getWorksheet("Booth Passport")!;
    expect(ws.getRow(2).values).toEqual([undefined, "Aiman Zulkifli", "a@x.my", "Management", "Yes", "No", 1, "Yes"]);
  });

  it("leaves company off the sheet even when the attendee has one", () => {
    const withFieldCompany = [
      { id: "a3", name: "Nadia Rahman", email: "n@x.my", category: "VIP", extra: { company: "Northwind" } },
    ] as unknown as Parameters<typeof buildPassportWorkbook>[0];
    const ws = buildPassportWorkbook(withFieldCompany, booths, [], null).getWorksheet("Booth Passport")!;
    expect(ws.getRow(2).values).toEqual([undefined, "Nadia Rahman", "n@x.my", "VIP", "No", "No", 0, "No"]);
  });
});

describe("activity roster workbook", () => {
  const people = new Map([
    ["p1", { name: "Ann Tan", email: "a@b.co" }],
    ["p2", { name: "Bryan Koh", email: null }],
  ]);

  it("gives a booked session its own sheet with header and rows", () => {
    const sessions = [{ activityName: "Yoga", sessionTitle: "Morning", attendeeIds: ["p1"] }];
    const ws = buildActivityRostersWorkbook(sessions, [], people).getWorksheet("Yoga — Morning")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email"]);
    expect(ws.getRow(2).values).toEqual([undefined, "Ann Tan", "a@b.co"]);
  });

  it("still gives an unbooked session a sheet, with a header and no rows", () => {
    const sessions = [{ activityName: "Yoga", sessionTitle: "Evening", attendeeIds: [] }];
    const wb = buildActivityRostersWorkbook(sessions, [], people);
    const ws = wb.getWorksheet("Yoga — Evening")!;
    expect(ws).toBeTruthy();
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email"]);
    expect(ws.rowCount).toBe(1);
  });

  it("adds a not-booked sheet per required activity", () => {
    const unbooked = [{ activityName: "Yoga", attendeeIds: ["p2"] }];
    const ws = buildActivityRostersWorkbook([], unbooked, people).getWorksheet("Yoga — Not booked")!;
    expect(ws.getRow(2).getCell(1).value).toBe("Bryan Koh");
  });

  it("does not let two sessions differing only in case collide and throw", () => {
    const sessions = [
      { activityName: "Yoga", sessionTitle: "Morning", attendeeIds: ["p1"] },
      { activityName: "Yoga", sessionTitle: "morning", attendeeIds: ["p2"] },
    ];
    const wb = buildActivityRostersWorkbook(sessions, [], people);
    expect(wb.worksheets.length).toBe(2);
    const [first, second] = wb.worksheets;
    expect(first.name.toLowerCase()).not.toBe(second.name.toLowerCase());
  });

  it("keeps two long session names distinct even when they collide after truncation", () => {
    // Both sessions share an activity name so long that, combined with the separator, it alone
    // fills the 31-character cap - the naive truncation would make them identical.
    const activityName = "Regional teams offsite planning workshop";
    const sessions = [
      { activityName, sessionTitle: "Session A", attendeeIds: ["p1"] },
      { activityName, sessionTitle: "Session B", attendeeIds: ["p2"] },
    ];
    const wb = buildActivityRostersWorkbook(sessions, [], people);
    expect(wb.worksheets.length).toBe(2);
    const [first, second] = wb.worksheets;
    expect(first.name).not.toBe(second.name);
    expect(first.name.length).toBeLessThanOrEqual(31);
    expect(second.name.length).toBeLessThanOrEqual(31);
  });

  it("sanitises and caps a sheet name the same way rosterSheetName does", () => {
    const taken = new Set<string>();
    const name = activitySheetName("Team: Building / Trust?", "Round [1]", taken);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("names the unbooked sheet after the activity, sanitised and capped", () => {
    const taken = new Set<string>();
    const name = activityUnbookedSheetName("A very long required activity name indeed", taken);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("still writes one sheet when there are no sessions and no required activity to report", () => {
    // A workbook with zero worksheets is not a valid xlsx - Excel refuses to open it, which
    // would turn "nothing to print yet" into a download that silently fails.
    const wb = buildActivityRostersWorkbook([], [], people);
    expect(wb.worksheets.length).toBe(1);
    const ws = wb.getWorksheet("No sessions")!;
    expect(ws).toBeTruthy();
    expect(ws.getRow(1).getCell(1).value).toBe("This event's activities have no sessions yet.");
  });
});
