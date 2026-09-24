/**
 * An iCalendar (RFC 5545) file for one booked session, so an attendee can put it in Outlook,
 * Google or Apple Calendar. Pure: the route that serves it does the loading and the checks.
 *
 * Times go out in UTC rather than as Malaysian local time with a VTIMEZONE block. Every
 * calendar app converts a UTC instant correctly, and a hand-written VTIMEZONE is the part
 * Outlook is fussiest about.
 *
 * It is a snapshot. If the desk later moves or cancels the seat, the calendar keeps the old
 * one; a switch deletes the booking and inserts a new one, so its UID is new too.
 */

const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `YYYY-MM-DD` + `HH:MM` in Kuala Lumpur (UTC+8, no DST) as an iCalendar UTC stamp. */
export function klToUtc(day: string, hhmm: string): string {
  // Postgres hands back `time` as HH:MM:SS; listSessions trims it, but a caller that forgets
  // would otherwise get an Invalid Date and a thrown RangeError.
  return utcStamp(new Date(Date.parse(`${day}T${hhmm.slice(0, 5)}:00Z`) - KL_OFFSET_MS));
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes a TEXT value: backslash, semicolon, comma and newline are reserved. */
export function icsText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets, never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    // A continuation line spends one of its 75 octets on the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + n > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += ch;
    octets += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export type BookingIcsInput = {
  /** The booking's id: stable for the seat, so adding it twice is recognisably one event. */
  uid: string;
  title: string;
  day: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  /** The event's name, shown above the link in the calendar entry's notes. */
  description: string;
  /** The activity's page in the attendee's portal. */
  url: string;
  now: Date;
};

export function bookingIcs(b: BookingIcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ecopia Events//ECP Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.uid}@ecphub`,
    `DTSTAMP:${utcStamp(b.now)}`,
    `DTSTART:${klToUtc(b.day, b.startsAt)}`,
    // No end time: RFC 5545 ends the event where it starts, which is the honest reading.
    ...(b.endsAt ? [`DTEND:${klToUtc(b.day, b.endsAt)}`] : []),
    `SUMMARY:${icsText(b.title)}`,
    ...(b.location ? [`LOCATION:${icsText(b.location)}`] : []),
    `DESCRIPTION:${icsText(`${b.description}\n\n${b.url}`)}`,
    `URL:${b.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(b.title)}`,
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
