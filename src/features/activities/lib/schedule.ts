import { isoToLocalInput, localInputToIso } from "@/lib/time";
import { shortDate } from "@/lib/text";
import type { Activity } from "@/lib/types";

/**
 * Scheduled opening's rules and words (D600-D609). Pure, so the admin action, the Schedule
 * button, the list pill and the attendee card all say the same thing about the same instant.
 */

/** The Schedule dialog's two fields as one instant in Malaysia time, or null if either is blank or not a real date. */
export function scheduleAt(date: string, time: string): string | null {
  return localInputToIso(`${date.trim()}T${time.trim()}`);
}

/**
 * Why a schedule cannot be saved (D602), as the flash to show - or null when it can. An open
 * activity has nothing to schedule; the time must be strictly after now.
 */
export function scheduleCheck(activity: Pick<Activity, "is_open">, at: string | null, now: Date): string | null {
  if (activity.is_open) return "It's already open.";
  if (!at) return "Pick a date and time.";
  if (new Date(at).getTime() <= now.getTime()) return "Pick a time in the future.";
  return null;
}

/** "10:00" → "10:00am", "00:30" → "12:30am", "12:00" → "12:00pm". */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** When it opens, in Malaysia time: "Sat 17 Oct, 10:00am" (D604, D607). */
export function opensLabel(iso: string): string {
  const [day, time] = isoToLocalInput(iso).split("T");
  return `${shortDate(day)}, ${clock(time)}`;
}

/** The same without the weekday, for the list's narrow Status column: "17 Oct, 10:00am" (D608). */
export function opensShort(iso: string): string {
  return opensLabel(iso).split(" ").slice(1).join(" ");
}

/**
 * What the Open switch writes, given what the organiser's page showed and what they asked for.
 * Null when the activity is already there - the timer may have opened it while the page sat
 * showing Closed, and flipping the server's state instead would close what they meant to open.
 * Either way any schedule goes (D602), so the timer can never reopen something just closed.
 */
export function openSwitchPatch(current: boolean, wanted: boolean): { is_open: boolean; opens_at: null } | null {
  return current === wanted ? null : { is_open: wanted, opens_at: null };
}

/** Every answer `schedule_opening` can give (D611). */
export type ScheduleResult = "ok" | "open" | "archived" | "missing";

/**
 * The flash for a schedule the database refused, or null when it was saved (D611). 'open' is
 * the race with the timer or another organiser: the page drew Closed, but it opened meanwhile.
 */
export function scheduleResultFlash(result: ScheduleResult): string | null {
  switch (result) {
    case "ok": return null;
    case "open": return "It's already open.";
    case "archived": return "This event is archived, so nothing in it can be scheduled.";
    case "missing": return "That activity no longer exists.";
  }
}
