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
 * - at most two buttons, both links, each with at most one variable and only as its tail,
 *   which Meta appends to the approved prefix (see `buttonParams` in whatsapp.ts). That tail
 *   is the attendee's token, or - for a link to /m/ - their booked session's id (D835).
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
  /** The link buttons, in order: the fixed start of each URL, and what completes it. */
  buttons: TemplateButton[];
};

/**
 * What a button's `{{1}}` is filled with: the attendee's token (/a/<token>), their booked
 * session's id (/m/<session>, the "View map" button, D835), or nothing for a fixed link.
 */
export type ButtonFill = "token" | "session_map" | "none";
export type TemplateButton = { text: string; urlPrefix: string; fill: ButtonFill };

/** A button's fill, read from where its link goes: /m/ is this app's map forwarder. */
function buttonFill(urlPrefix: string, variables: number): ButtonFill {
  if (variables === 0) return "none";
  return new URL(urlPrefix).pathname.endsWith("/m/") ? "session_map" : "token";
}

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

  const raw = part("BUTTONS")?.buttons ?? [];
  if (raw.length > 2) return null;
  const buttons: TemplateButton[] = [];
  for (const b of raw) {
    if (b.type !== "URL" || !b.url) return null;
    const vars = countVariables(b.url);
    if (vars > 1 || (vars === 1 && !b.url.endsWith("{{1}}"))) return null;
    const urlPrefix = b.url.replace("{{1}}", "");
    buttons.push({ text: b.text, urlPrefix, fill: buttonFill(urlPrefix, vars) });
  }

  return {
    name: t.name,
    language: t.language,
    category: t.category ?? "",
    header: header?.text ?? null,
    body,
    footer: part("FOOTER")?.text ?? null,
    variables: countVariables(body),
    buttons,
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
export function needsBooking(sources: readonly string[], buttons: readonly TemplateButton[] = []): boolean {
  return sources.some((s) => (BOOKING_SOURCES as readonly string[]).includes(s)) || hasMapButton(buttons);
}
export function hasMapButton(buttons: readonly TemplateButton[]): boolean {
  return buttons.some((b) => b.fill === "session_map");
}

type BookedSession = Pick<ActivitySession, "id" | "day" | "starts_at" | "location" | "location_url">;

/**
 * Of one person's sessions in an activity, the one a reminder is about: the next to start, or
 * the last one when every one has begun (a reminder sent late still names a real slot). One
 * booking is the usual case; this only matters where an activity lets people take several.
 */
export function sessionToRemind<T extends Pick<BookedSession, "day" | "starts_at">>(sessions: readonly T[], now: { date: string; time: string }): T | null {
  const sorted = [...sessions].sort((a, b) => (a.day + a.starts_at).localeCompare(b.day + b.starts_at));
  return sorted.find((s) => s.day + s.starts_at >= now.date + now.time) ?? sorted.at(-1) ?? null;
}

/** One person's booking as the three values above. The time reads after "at": "10:30 on Sat 8 Nov". */
export function bookingValues(activityName: string, session: BookedSession | null): Booking | null {
  if (!session) return null;
  return {
    activity: activityName,
    time: `${session.starts_at} on ${shortDate(session.day)}`,
    location: session.location?.trim() ?? "",
    sessionId: session.id,
    hasMap: Boolean(session.location_url?.trim()),
  };
}
/** `sessionId` completes the View map button; `hasMap` is whether that link leads anywhere. */
export type Booking = { activity: string; time: string; location: string; sessionId: string; hasMap: boolean };

/** What one button's `{{1}}` is for one attendee; "" for a fixed link. */
export function buttonValue(button: TemplateButton, token: string, booking: Booking | null | undefined): string {
  if (button.fill === "token") return token;
  if (button.fill === "session_map") return booking?.sessionId ?? "";
  return "";
}

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
