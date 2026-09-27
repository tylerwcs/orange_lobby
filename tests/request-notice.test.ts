import { describe, expect, it } from "vitest";
import { requestNotice } from "@/lib/request-notice";
import { sessionPlaceLabel } from "@/lib/activities";

const base = {
  attendeeName: "Lim Hock Cheng",
  activityName: "Health Screening",
  eventName: "Ecopia Kick-Off Meeting 2026",
  fromSession: "Wed 30 Sep · 10:00",
  toSession: "Wed 30 Sep · 11:30",
};

describe("requestNotice", () => {
  it("tells an approved switch where they are now", () => {
    expect(requestNotice({ ...base, decision: "approved", kind: "switch" })).toEqual({
      template: "ecphub_booking_changed",
      bodyParams: ["Lim Hock Cheng", "Health Screening", "Ecopia Kick-Off Meeting 2026", "Wed 30 Sep · 11:30"],
    });
  });

  it("tells an approved cancel that the seat is released, with no session to name", () => {
    expect(requestNotice({ ...base, toSession: null, decision: "approved", kind: "cancel" })).toEqual({
      template: "ecphub_booking_cancelled",
      bodyParams: ["Lim Hock Cheng", "Health Screening", "Ecopia Kick-Off Meeting 2026"],
    });
  });

  it("tells a declined request the session they still hold, not the one they asked for", () => {
    expect(requestNotice({ ...base, decision: "declined", kind: "switch" })).toEqual({
      template: "ecphub_request_declined",
      bodyParams: ["Lim Hock Cheng", "Health Screening", "Ecopia Kick-Off Meeting 2026", "Wed 30 Sep · 10:00"],
    });
  });

  it("uses the same declined message for a declined cancel", () => {
    expect(requestNotice({ ...base, toSession: null, decision: "declined", kind: "cancel" }).template).toBe("ecphub_request_declined");
  });

  // Meta refuses a parameter with a newline, a tab or more than four spaces in a row, and an
  // empty one — any of which a masterlist cell can carry.
  it("flattens whitespace a template parameter may not contain", () => {
    const n = requestNotice({ ...base, attendeeName: "Lim\tHock\n Cheng", activityName: "Health     Screening", decision: "approved", kind: "switch" });
    expect(n.bodyParams.slice(0, 2)).toEqual(["Lim Hock Cheng", "Health Screening"]);
  });

  it("never sends an empty parameter", () => {
    const n = requestNotice({ ...base, attendeeName: "  ", decision: "approved", kind: "switch" });
    expect(n.bodyParams[0]).toBe("there");
  });
});

describe("sessionPlaceLabel", () => {
  it("names the day and time, and the place when the session has one", () => {
    expect(sessionPlaceLabel({ day: "2026-09-30", starts_at: "11:30", location: "Room 3A" })).toMatch(/30 Sep · 11:30, Room 3A$/);
    expect(sessionPlaceLabel({ day: "2026-09-30", starts_at: "11:30", location: null })).toMatch(/30 Sep · 11:30$/);
  });
});
