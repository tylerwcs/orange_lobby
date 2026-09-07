/** Everything the pilot schedules is Malaysian local time; MYT is UTC+8 with no DST. */
export const MY_TZ = "Asia/Kuala_Lumpur";

const MY_OFFSET = "+08:00";
const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Turns a `<input type="datetime-local">` value (`YYYY-MM-DDTHH:MM`) into an
 * absolute ISO instant anchored to Malaysian time. Null for blank or malformed input.
 */
export function localInputToIso(s: string | null): string | null {
  if (!s) return null;
  const m = LOCAL_INPUT_RE.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (Number(m[4]) > 23 || Number(m[5]) > 59) return null;
  // Date's lenient parser rolls 2026-02-30 over into March, so check the calendar by hand.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${MY_OFFSET}`;
}

/**
 * Renders an ISO instant as a `datetime-local` value in Malaysian time, so the
 * settings form shows the same wall clock regardless of where the server runs.
 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p: Record<string, string> = {};
  for (const part of formatter.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
