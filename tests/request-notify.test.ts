import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityChangeRequest, Event } from "@/lib/types";

// The notify step reads the attendee, activity and sessions, then hands one recipient to
// runSend. Those are stubbed here so the test covers what this step decides — who can be
// reached, which template, what the desk is told — without a database or Meta.
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ attendee: null as unknown, activity: null as unknown, sessions: [] as unknown[] }));
const runSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/attendees", () => ({ getAttendee: async () => db.attendee }));
vi.mock("@/lib/db/activities", () => ({ getActivity: async () => db.activity, listSessions: async () => db.sessions }));
vi.mock("@/lib/whatsapp-run", () => ({ runSend }));

const { notifyRequestDecision, decisionFlash } = await import("@/lib/request-notify");

const phoneField = { key: "phone", label: "Phone", type: "phone" as const };
const ev = { id: "e1", org_id: "o1", name: "Kick-Off 2026", registration_questions: [], attendee_fields: [phoneField] } as unknown as Event;
const request = {
  id: "r1", event_id: "e1", activity_id: "a1", attendee_id: "p1", kind: "switch",
  from_session_id: "s1", to_session_id: "s2", status: "pending", created_at: "", decided_at: null, decided_by: null,
} as ActivityChangeRequest;

beforeEach(() => {
  db.attendee = { id: "p1", name: "Lim Hock Cheng", token: "45c2fbbhmn8g", extra: { phone: "012-345 6789" } };
  db.activity = { id: "a1", name: "Health Screening" };
  db.sessions = [
    { id: "s1", activity_id: "a1", day: "2026-09-30", starts_at: "10:00", location: null },
    { id: "s2", activity_id: "a1", day: "2026-09-30", starts_at: "11:30", location: "Room 3A" },
  ];
  runSend.mockReset();
  runSend.mockResolvedValue({ sent: 1, failed: 0, skipped: 0 });
});

describe("notifyRequestDecision", () => {
  it("sends an approved switch the new session, with their portal button, once per request", async () => {
    expect(await notifyRequestDecision(ev, request, "approved")).toEqual({ sent: true });
    const call = runSend.mock.calls[0][0];
    expect(call.template).toBe("ecphub_booking_changed");
    expect(call.recipients).toEqual([{ attendee: db.attendee, to: "60123456789" }]);
    const params = call.params(db.attendee);
    expect(params.bodyParams[3]).toMatch(/11:30, Room 3A$/);
    expect(params.buttonParam).toBe("45c2fbbhmn8g");
    expect(call.dedupeKey(db.attendee)).toBe("request:r1");
  });

  it("tells a declined attendee the session they keep", async () => {
    await notifyRequestDecision(ev, request, "declined");
    const call = runSend.mock.calls[0][0];
    expect(call.template).toBe("ecphub_request_declined");
    expect(call.params(db.attendee).bodyParams[3]).toMatch(/10:00$/);
  });

  it("sends nothing, and says why, when the attendee has no phone on file", async () => {
    db.attendee = { ...(db.attendee as object), extra: {} };
    expect(await notifyRequestDecision(ev, request, "approved")).toEqual({ sent: false, reason: "no phone on file" });
    expect(runSend).not.toHaveBeenCalled();
  });

  it("sends nothing when the event has no phone column", async () => {
    const noPhone = { ...ev, attendee_fields: [] } as unknown as Event;
    expect(await notifyRequestDecision(noPhone, request, "approved")).toEqual({ sent: false, reason: "this event has no phone column" });
  });

  it("passes Meta's reason through when the send fails", async () => {
    runSend.mockResolvedValue({ sent: 0, failed: 1, skipped: 0, lastError: "Template name does not exist in the translation" });
    expect(await notifyRequestDecision(ev, request, "approved")).toEqual({ sent: false, reason: "Template name does not exist in the translation" });
  });

  it("does not message twice for the same request", async () => {
    runSend.mockResolvedValue({ sent: 0, failed: 0, skipped: 1 });
    expect(await notifyRequestDecision(ev, request, "approved")).toEqual({ sent: false, reason: "it was already sent for this request" });
  });

  it("never throws, because the decision is already saved", async () => {
    runSend.mockRejectedValue(new Error("network down"));
    expect(await notifyRequestDecision(ev, request, "approved")).toEqual({ sent: false, reason: "something went wrong while sending" });
  });
});

describe("decisionFlash", () => {
  it("puts the decision first, then what WhatsApp did", () => {
    expect(decisionFlash("Request approved.", { sent: true })).toBe("Request approved. WhatsApp sent.");
    expect(decisionFlash("Request declined.", { sent: false, reason: "no phone on file" })).toBe("Request declined. Not sent on WhatsApp: no phone on file.");
  });
});
