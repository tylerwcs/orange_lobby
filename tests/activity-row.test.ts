import { describe, it, expect } from "vitest";
import { bookingRow, submissionRow, passportRow, listSummary, removeWarning } from "@/lib/activity-row";

describe("bookingRow", () => {
  const base = { days: ["2026-09-28", "2026-10-02"], sessions: 32, booked: 3, seats: 96, pending: 0 };

  it("counts seats taken of seats offered, with when it runs", () => {
    expect(bookingRow(base)).toEqual({
      kind: "Sessions",
      detail: "28 Sep – 2 Oct · 32 sessions",
      progress: { done: 3, total: 96, label: "3 of 96 seats" },
      attention: null,
    });
  });

  it("flags requests waiting on the desk, singular and plural", () => {
    expect(bookingRow({ ...base, pending: 1 }).attention).toBe("1 request waiting");
    expect(bookingRow({ ...base, pending: 3 }).attention).toBe("3 requests waiting");
  });

  // A booking nobody can book is the thing to fix first, so it outranks a waiting request.
  it("flags an activity with no sessions, and says so in place of a progress line", () => {
    const row = bookingRow({ ...base, days: [], sessions: 0, seats: 0, booked: 0, pending: 0 });
    expect(row.attention).toBe("No sessions yet");
    expect(row.detail).toBeNull();
    expect(row.progress).toEqual({ done: 0, total: 0, label: "No seats yet" });
  });

  it("names one session in the singular", () => {
    expect(bookingRow({ ...base, days: ["2026-09-28"], sessions: 1 }).detail).toBe("Mon 28 Sep · 1 session");
  });
});

describe("submissionRow", () => {
  const form = { per_day: false, max_per_attendee: 1, starts_on: null, ends_on: null, venue: null };

  it("counts the people who submitted of the people it is for, with its cap", () => {
    expect(submissionRow({ form, submitters: 1, eligible: 37 })).toEqual({
      kind: "Submission",
      detail: "Once",
      progress: { done: 1, total: 37, label: "1 of 37 submitted" },
      attention: null,
    });
  });

  it("puts its dates and venue before the cap", () => {
    const dated = { ...form, starts_on: "2026-09-28", ends_on: "2026-09-30", venue: "Gym", per_day: true, max_per_attendee: null };
    expect(submissionRow({ form: dated, submitters: 0, eligible: 10 }).detail).toBe("28 – 30 Sep · Gym · Once a day");
  });
});

describe("passportRow", () => {
  it("counts full cards of the people it is for, with its booths", () => {
    expect(passportRow({ booths: 3, completed: 0, eligible: 37, open: false })).toEqual({
      kind: "Passport",
      detail: "3 booths",
      progress: { done: 0, total: 37, label: "0 of 37 cards full" },
      attention: null,
    });
  });

  // Open with nothing to stamp at: attendees see a card, and no booth can stamp it.
  it("flags an open passport with no booths", () => {
    expect(passportRow({ booths: 0, completed: 0, eligible: 37, open: true }).attention).toBe("No booths yet");
    expect(passportRow({ booths: 0, completed: 0, eligible: 37, open: false }).attention).toBeNull();
  });

  it("names one booth in the singular", () => {
    expect(passportRow({ booths: 1, completed: 0, eligible: 5, open: true }).detail).toBe("1 booth");
  });
});

describe("listSummary", () => {
  it("counts activities, the open ones, and the ones that need the organiser", () => {
    expect(listSummary([
      { open: true, attention: "1 request waiting" },
      { open: true, attention: null },
      { open: false, attention: null },
    ])).toBe("3 activities · 2 open · 1 needs you");
  });

  it("leaves out what is zero, and names one activity in the singular", () => {
    expect(listSummary([{ open: false, attention: null }])).toBe("1 activity");
    expect(listSummary([{ open: true, attention: "a" }, { open: true, attention: "b" }])).toBe("2 activities · 2 open · 2 need you");
    expect(listSummary([])).toBe("No activities yet");
  });
});

describe("removeWarning", () => {
  it("names what a booking takes with it", () => {
    expect(removeWarning({ kind: "booking", sessions: 1, bookings: 3 })).toBe("Its 1 session and 3 bookings go with it. This can't be undone.");
  });
  it("names a submission's answers only when there are some", () => {
    expect(removeWarning({ kind: "submission", submissions: 2 })).toBe("It takes 2 submissions and any uploaded files with it. This can't be undone.");
    expect(removeWarning({ kind: "submission", submissions: 0 })).toBe("This can't be undone.");
  });
  it("tells the organiser to close a stamped passport instead (D188)", () => {
    expect(removeWarning({ kind: "passport", booths: 1 })).toBe("Its 1 booth and its scanner link go with it. Once anyone has been stamped it can't be deleted, so close it instead.");
    expect(removeWarning({ kind: "passport", booths: 3 })).toBe("Its 3 booths and their scanner links go with it. Once anyone has been stamped it can't be deleted, so close it instead.");
  });
});
