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
