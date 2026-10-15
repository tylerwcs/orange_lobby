import { describe, expect, it } from "vitest";
import { openSwitchPatch, opensLabel, opensShort, scheduleAt, scheduleCheck } from "@/features/activities/lib/schedule";

describe("scheduleAt", () => {
  it("reads the dialog's date and time as Malaysia time", () => {
    expect(scheduleAt("2026-10-17", "10:00")).toBe("2026-10-17T10:00:00+08:00");
  });

  it("is null when either half is missing or malformed", () => {
    expect(scheduleAt("", "10:00")).toBeNull();
    expect(scheduleAt("2026-10-17", "")).toBeNull();
    expect(scheduleAt("2026-02-30", "10:00")).toBeNull();
  });
});

describe("scheduleCheck (D602)", () => {
  const now = new Date("2026-10-16T02:00:00Z"); // 10:00 in KL
  const closed = { is_open: false };

  it("refuses an activity that is already open", () => {
    expect(scheduleCheck({ is_open: true }, "2026-10-17T10:00:00+08:00", now)).toBe("It's already open.");
  });

  it("asks for a date and time when the form was blank", () => {
    expect(scheduleCheck(closed, null, now)).toBe("Pick a date and time.");
  });

  it("refuses now and the past", () => {
    expect(scheduleCheck(closed, "2026-10-16T10:00:00+08:00", now)).toBe("Pick a time in the future.");
    expect(scheduleCheck(closed, "2026-10-15T10:00:00+08:00", now)).toBe("Pick a time in the future.");
  });

  it("accepts a time in the future", () => {
    expect(scheduleCheck(closed, "2026-10-16T10:01:00+08:00", now)).toBeNull();
  });
});

describe("opensLabel / opensShort (D604, D608)", () => {
  it("says the Malaysia day and a 12-hour time", () => {
    expect(opensLabel("2026-10-17T02:00:00+00:00")).toBe("Sat 17 Oct, 10:00am");
    expect(opensShort("2026-10-17T02:00:00+00:00")).toBe("17 Oct, 10:00am");
  });

  it("puts just after midnight on the Malaysia day, as 12:30am", () => {
    // 16:30 UTC on the 16th is 00:30 on the 17th in KL.
    expect(opensLabel("2026-10-16T16:30:00Z")).toBe("Sat 17 Oct, 12:30am");
  });

  it("reads noon as 12:00pm and the afternoon with pm", () => {
    expect(opensLabel("2026-10-17T04:00:00Z")).toBe("Sat 17 Oct, 12:00pm");
    expect(opensLabel("2026-10-17T07:05:00Z")).toBe("Sat 17 Oct, 3:05pm");
  });
});

describe("openSwitchPatch (D602, final review)", () => {
  it("opens a closed activity and drops any schedule", () => {
    expect(openSwitchPatch(false, true)).toEqual({ is_open: true, opens_at: null });
  });

  it("closes an open one", () => {
    expect(openSwitchPatch(true, false)).toEqual({ is_open: false, opens_at: null });
  });

  it("writes nothing when the timer already did what the organiser asked for", () => {
    // The page drew Closed, the timer opened it, then the organiser flipped it to open:
    // flipping the server's state instead would close what they meant to open.
    expect(openSwitchPatch(true, true)).toBeNull();
    expect(openSwitchPatch(false, false)).toBeNull();
  });
});
