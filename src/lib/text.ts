import { MY_TZ } from "@/lib/time";

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

// Built by hand rather than via Intl/en-GB: ICU data on some Node builds
// abbreviates September as "Sept" instead of "Sep", which is inconsistent
// across environments and breaks the Malaysia-style rendering below.
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmt = (d: string, withYear: boolean) => {
  const dt = new Date(d + "T00:00:00Z");
  const day = dt.getUTCDate();
  const month = MONTHS[dt.getUTCMonth()];
  return withYear ? `${day} ${month} ${dt.getUTCFullYear()}` : `${day} ${month}`;
};

export function formatDateRange(starts: string | null, ends: string | null): string {
  if (!starts && !ends) return "";
  const a = starts ?? ends!, b = ends ?? starts!;
  if (a === b) return fmt(a, true);
  return `${fmt(a, false)} – ${fmt(b, true)}`;
}

/** `YYYY-MM-DD` as `"Wed 30 Sep"`. Read as a calendar date, so UTC accessors keep it stable. */
export function shortDate(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

/** An ISO instant as `"8 Sep, 17:13"` in Malaysian time. The month comes from MONTHS, not ICU. */
export function shortDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MY_TZ, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${Number(g("day"))} ${MONTHS[Number(g("month")) - 1]}, ${g("hour")}:${g("minute")}`;
}

/** An ISO instant as `"09:05"` in Malaysian time; empty string when unparseable. */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: MY_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** A name as people expect to read it: "WONG CAI SHEN" becomes "Wong Cai Shen"; mixed case is left alone. */
export function displayName(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * How long ago something happened, for a table watched live. Absolute times answer
 * "when"; a crew lead watching the door is asking "is it still moving". Clock skew
 * between the browser and the server can put a scan slightly in the future, which
 * reads as "just now" rather than a negative age.
 */
export function elapsed(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return shortDate(iso.slice(0, 10));
}
