import type { ActivitySession } from "@/lib/types";
import { shortDate } from "@/lib/text";

/**
 * The approved WhatsApp templates the admin can choose between, as this app understands them.
 *
 * Meta holds the templates; this reads what it says about each one into the shape the send
 * screen needs: the text to preview, how many `{{n}}` the body carries, and the button. A
 * template is only offered when this app can fill it:
 * - approved, so Meta will take it;
 * - positional variables (`{{1}}`), not named ones;
 * - no variables in the header, which this app never sends;
 * - at most one button, and if it is a link its only variable is the tail — the attendee's
 *   token, which Meta appends to the approved prefix (see `buttonParam` in whatsapp.ts).
 * Anything else is left out rather than offered and then rejected at send time.
 *
 * Pure, so the preview and the send build their text from the same code.
 */

/** The parts of Meta's `message_templates` response this reads. */
export type GraphTemplate = {
  name: string;
  status: string;
  category?: string;
  language: string;
  parameter_format?: string;
  components: {
    type: string;
    format?: string;
    text?: string;
    buttons?: { type: string; text: string; url?: string }[];
  }[];
};

export type Template = {
  name: string;
  language: string;
  category: string;
  header: string | null;
  body: string;
  footer: string | null;
  /** How many `{{n}}` the body carries, numbered 1..n. */
  variables: number;
  /** The link button, with the URL as it will look once the token is appended. */
  button: { text: string; urlPrefix: string } | null;
};

const VAR = /\{\{(\d+)\}\}/g;

/** The highest `{{n}}` in a text, which is how many values it needs. */
function countVariables(text: string): number {
  let max = 0;
  for (const m of text.matchAll(VAR)) max = Math.max(max, Number(m[1]));
  return max;
}

/** One Graph template as a `Template`, or null when this app cannot send it (see above). */
export function readTemplate(t: GraphTemplate): Template | null {
  if (t.status !== "APPROVED") return null;
  if (t.parameter_format && t.parameter_format !== "POSITIONAL") return null;
  const part = (type: string) => t.components.find((c) => c.type === type);

  const header = part("HEADER");
  if (header && (header.format !== "TEXT" || countVariables(header.text ?? "") > 0)) return null;
  const body = part("BODY")?.text;
  if (!body) return null;

  const buttons = part("BUTTONS")?.buttons ?? [];
  if (buttons.length > 1) return null;
  let button: Template["button"] = null;
  const b = buttons[0];
  if (b) {
    if (b.type !== "URL" || !b.url) return null;
    const vars = countVariables(b.url);
    if (vars > 1 || (vars === 1 && !b.url.endsWith("{{1}}"))) return null;
    button = { text: b.text, urlPrefix: b.url.replace("{{1}}", "") };
  }

  return {
    name: t.name,
    language: t.language,
    category: t.category ?? "",
    header: header?.text ?? null,
    body,
    footer: part("FOOTER")?.text ?? null,
    variables: countVariables(body),
    button,
  };
}

/**
 * What can fill a `{{n}}`. `custom` is one fixed text, the same for everybody. The three
 * `session_` ones are each person's own booking, so they need a "Booked for …" audience: that
 * is what says which activity's booking is meant (BOOKING_SOURCES).
 */
export const SOURCES = {
  attendee_name: "Attendee's name",
  event_name: "Event name",
  event_dates: "Event dates",
  venue: "Venue",
  session_activity: "Booked activity",
  session_time: "Their session time",
  session_location: "Their session location",
  custom: "Custom text",
} as const;
export type Source = keyof typeof SOURCES;

export function isSource(v: string): v is Source {
  return Object.hasOwn(SOURCES, v);
}

/** The sources read from one person's booking, which only a "Booked for …" audience can fill. */
export const BOOKING_SOURCES: readonly Source[] = ["session_activity", "session_time", "session_location"];
export function needsBooking(sources: readonly string[]): boolean {
  return sources.some((s) => (BOOKING_SOURCES as readonly string[]).includes(s));
}

type BookedSession = Pick<ActivitySession, "day" | "starts_at" | "location">;

/**
 * Of one person's sessions in an activity, the one a reminder is about: the next to start, or
 * the last one when every one has begun (a reminder sent late still names a real slot). One
 * booking is the usual case; this only matters where an activity lets people take several.
 */
export function sessionToRemind<T extends BookedSession>(sessions: readonly T[], now: { date: string; time: string }): T | null {
  const sorted = [...sessions].sort((a, b) => (a.day + a.starts_at).localeCompare(b.day + b.starts_at));
  return sorted.find((s) => s.day + s.starts_at >= now.date + now.time) ?? sorted.at(-1) ?? null;
}

/** One person's booking as the three values above. The time reads after "at": "10:30 on Sat 8 Nov". */
export function bookingValues(activityName: string, session: BookedSession | null): Booking | null {
  if (!session) return null;
  return { activity: activityName, time: `${session.starts_at} on ${shortDate(session.day)}`, location: session.location?.trim() ?? "" };
}
export type Booking = { activity: string; time: string; location: string };

/**
 * What each variable is filled with before the organiser changes anything: the two event
 * templates open "Dear {{1}}", "your registration for {{2}}" and, in the longer one, "on
 * {{3}}", so that order is the default. A fourth has no obvious meaning and asks for text.
 */
export function defaultSources(variables: number): Source[] {
  const order: Source[] = ["attendee_name", "event_name", "event_dates"];
  return Array.from({ length: variables }, (_, i) => order[i] ?? "custom");
}

export type SourceValues = {
  attendeeName: string; eventName: string; eventDates: string; venue: string;
  /** This person's booking in the audience's activity; absent outside a "Booked for …" audience. */
  booking?: Booking | null;
};

/** The value one variable takes for one attendee. */
export function sourceValue(source: Source, v: SourceValues, custom: string): string {
  switch (source) {
    case "attendee_name": return v.attendeeName;
    case "event_name": return v.eventName;
    case "event_dates": return v.eventDates;
    case "venue": return v.venue;
    case "session_activity": return v.booking?.activity ?? "";
    case "session_time": return v.booking?.time ?? "";
    case "session_location": return v.booking?.location ?? "";
    case "custom": return custom;
  }
}

/** A text with its `{{n}}` replaced, 1-based. A missing value leaves the placeholder showing. */
export function fillVariables(text: string, values: string[]): string {
  return text.replace(VAR, (whole, n) => values[Number(n) - 1] || whole);
}
