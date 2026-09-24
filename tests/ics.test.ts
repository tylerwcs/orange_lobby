import { describe, it, expect } from "vitest";
import { bookingIcs, icsText, foldLine, klToUtc } from "@/lib/ics";

const input = {
  uid: "3f1c2a9e-0000-4000-8000-000000000001",
  title: "Wellness screening",
  day: "2026-09-30",
  startsAt: "09:30",
  endsAt: "10:00",
  location: "Level 3, Room A",
  description: "Ecopia Kick-Off Meeting 2026",
  url: "https://ecphub.vercel.app/e/ecpkom/a/abcdefghjkmn/activities/x",
  now: new Date("2026-09-24T04:05:06.789Z"),
};

/** The file's lines, unfolded, as a calendar app reads them. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n");
}

describe("klToUtc", () => {
  it("moves Malaysian wall-clock time back eight hours", () => {
    expect(klToUtc("2026-09-30", "09:30")).toBe("20260930T013000Z");
  });

  it("accepts Postgres's HH:MM:SS as well", () => {
    expect(klToUtc("2026-09-30", "09:30:00")).toBe("20260930T013000Z");
  });

  it("crosses into the previous UTC day before 08:00", () => {
    expect(klToUtc("2026-10-01", "07:15")).toBe("20260930T231500Z");
  });
});

describe("icsText", () => {
  it("escapes the characters RFC 5545 reserves in text", () => {
    expect(icsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("drops carriage returns so a Windows line break is one newline", () => {
    expect(icsText("a\r\nb")).toBe("a\\nb");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Hi")).toBe("SUMMARY:Hi");
  });

  it("folds at 75 octets with a leading space on each continuation", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"x".repeat(200)}`);
  });

  it("never splits a multi-byte character across a fold", () => {
    const text = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(text);
    for (const p of folded.split("\r\n")) expect(p).not.toContain("�");
    expect(folded.replace(/\r\n /g, "")).toBe(text);
  });
});

describe("bookingIcs", () => {
  it("is one VEVENT inside one VCALENDAR, with CRLF line endings", () => {
    const ics = bookingIcs(input);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(lines(ics)).toContain("VERSION:2.0");
    expect(lines(ics)).toContain("METHOD:PUBLISH");
  });

  it("writes the session's times in UTC, so no VTIMEZONE is needed", () => {
    const l = lines(bookingIcs(input));
    expect(l).toContain("DTSTART:20260930T013000Z");
    expect(l).toContain("DTEND:20260930T020000Z");
    expect(l).toContain("DTSTAMP:20260924T040506Z");
    expect(l.join("\n")).not.toContain("VTIMEZONE");
  });

  it("leaves DTEND out when the session has no end time", () => {
    const l = lines(bookingIcs({ ...input, endsAt: null }));
    expect(l).toContain("DTSTART:20260930T013000Z");
    expect(l.some((x) => x.startsWith("DTEND"))).toBe(false);
  });

  it("carries the name, place, link back and a stable UID", () => {
    const l = lines(bookingIcs(input));
    expect(l).toContain("SUMMARY:Wellness screening");
    expect(l).toContain("LOCATION:Level 3\\, Room A");
    expect(l).toContain(`URL:${input.url}`);
    expect(l).toContain(`DESCRIPTION:Ecopia Kick-Off Meeting 2026\\n\\n${input.url}`);
    expect(l).toContain(`UID:${input.uid}@ecphub`);
  });

  it("omits LOCATION when the session has none", () => {
    const l = lines(bookingIcs({ ...input, location: null }));
    expect(l.some((x) => x.startsWith("LOCATION"))).toBe(false);
  });

  it("reminds the attendee 15 minutes before", () => {
    const l = lines(bookingIcs(input));
    expect(l).toContain("BEGIN:VALARM");
    expect(l).toContain("TRIGGER:-PT15M");
    expect(l).toContain("ACTION:DISPLAY");
  });
});
