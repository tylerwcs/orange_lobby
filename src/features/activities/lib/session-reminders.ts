import type { ActivitySession } from "@/lib/types";

/**
 * D836: a WhatsApp reminder before each booked session, sent by the one-minute timer
 * (migration 0127, `runSessionReminders`). Pure, so when a reminder falls due is tested here
 * rather than by waiting for the clock.
 *
 * The template is Meta-approved and frozen: "Hi {{1}}, just a friendly reminder that your {{2}}
 * is scheduled at {{3}}. Kindly proceed to {{4}} …", buttons View my booking (/a/<token>) and
 * View map (/m/<session>).
 */
export const REMINDER_TEMPLATE = "ecphub_slot_reminder_map";
export const DEFAULT_REMINDER_MINUTES = 30;
export const MIN_REMINDER_MINUTES = 5;
export const MAX_REMINDER_MINUTES = 720;

type Slot = Pick<ActivitySession, "day" | "starts_at">;

/** When a session starts, as an instant. Days and times are Malaysian (UTC+8, no daylight saving). */
export function sessionStart(s: Slot): number {
  return Date.parse(`${s.day}T${s.starts_at.slice(0, 5)}:00+08:00`);
}

/**
 * Whether a session's reminder is due: from `minutes` before it starts until it starts. The
 * timer runs every minute and each person is claimed once (`reminderKey`), so the window only
 * has to be wide enough that a missed minute or a booking made late still gets one.
 */
export function reminderDue(s: Slot, minutes: number, now: Date): boolean {
  const start = sessionStart(s);
  return now.getTime() >= start - minutes * 60_000 && now.getTime() < start;
}

/** The Malaysian days a due session can fall on: today, and tomorrow for a reminder that crosses midnight. */
export function reminderDays(now: Date): string[] {
  const day = (t: number) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
  return [day(now.getTime()), day(now.getTime() + MAX_REMINDER_MINUTES * 60_000)].filter((d, i, a) => a.indexOf(d) === i);
}

/** One reminder per person per session: switching session earns a reminder for the new one. */
export function reminderKey(sessionId: string, attendeeId: string): string {
  return `session_reminder:${sessionId}:${attendeeId}`;
}

/** The message names the place and its button opens the map, so a session needs both. */
export function reminderReady(s: Pick<ActivitySession, "location" | "location_url">): boolean {
  return Boolean(s.location?.trim() && s.location_url?.trim());
}

/** The form's switch and minutes as the column's value: null is off. Throws the organiser's sentence. */
export function readReminderMinutes(on: boolean, raw: string | null): number | null {
  if (!on) return null;
  const value = raw?.trim() ? Number(raw) : DEFAULT_REMINDER_MINUTES;
  if (!Number.isInteger(value) || value < MIN_REMINDER_MINUTES || value > MAX_REMINDER_MINUTES) {
    throw new Error(`Send the reminder between ${MIN_REMINDER_MINUTES} and ${MAX_REMINDER_MINUTES} minutes before the session.`);
  }
  return value;
}
