import { describe, it, expect } from "vitest";
import {
  readReminderMinutes, reminderDays, reminderDue, reminderKey, reminderReady, sessionStart,
} from "@/features/activities/lib/session-reminders";

// 10:00 on 8 Nov in Malaysia is 02:00 UTC.
const at = (iso: string) => new Date(iso);
const slot = { day: "2026-11-08", starts_at: "10:00" };

describe("session reminders (D836)", () => {
  it("reads a session's start as Malaysian time", () => {
    expect(sessionStart(slot)).toBe(Date.parse("2026-11-08T02:00:00Z"));
    expect(sessionStart({ day: "2026-11-08", starts_at: "10:00:00" })).toBe(Date.parse("2026-11-08T02:00:00Z"));
  });

  it("is due from 30 minutes before until the session starts", () => {
    expect(reminderDue(slot, 30, at("2026-11-08T01:29:59Z"))).toBe(false);
    expect(reminderDue(slot, 30, at("2026-11-08T01:30:00Z"))).toBe(true);
    expect(reminderDue(slot, 30, at("2026-11-08T01:59:00Z"))).toBe(true);
    expect(reminderDue(slot, 30, at("2026-11-08T02:00:00Z"))).toBe(false);
  });

  it("looks at today and, near midnight, tomorrow in Malaysia", () => {
    expect(reminderDays(at("2026-11-08T02:00:00Z"))).toEqual(["2026-11-08"]);
    // 23:50 on 8 Nov in Malaysia: a 00:10 session is tomorrow's.
    expect(reminderDays(at("2026-11-08T15:50:00Z"))).toEqual(["2026-11-08", "2026-11-09"]);
  });

  it("keys one reminder per person per session", () => {
    expect(reminderKey("s1", "a1")).toBe("session_reminder:s1:a1");
    expect(reminderKey("s2", "a1")).not.toBe(reminderKey("s1", "a1"));
  });

  it("needs a place and a map link", () => {
    expect(reminderReady({ location: "Hall 2", location_url: "https://maps.app.goo.gl/x" })).toBe(true);
    expect(reminderReady({ location: " ", location_url: "https://maps.app.goo.gl/x" })).toBe(false);
    expect(reminderReady({ location: "Hall 2", location_url: null })).toBe(false);
  });

  it("reads the switch and minutes, defaulting to 30", () => {
    expect(readReminderMinutes(false, "45")).toBeNull();
    expect(readReminderMinutes(true, "")).toBe(30);
    expect(readReminderMinutes(true, "45")).toBe(45);
    expect(() => readReminderMinutes(true, "2")).toThrow(/between 5 and 720/);
    expect(() => readReminderMinutes(true, "12.5")).toThrow(/between 5 and 720/);
  });
});
