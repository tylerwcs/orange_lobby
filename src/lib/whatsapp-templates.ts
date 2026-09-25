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

/** What can fill a `{{n}}`. `custom` is one fixed text, the same for everybody. */
export const SOURCES = {
  attendee_name: "Attendee's name",
  event_name: "Event name",
  event_dates: "Event dates",
  venue: "Venue",
  custom: "Custom text",
} as const;
export type Source = keyof typeof SOURCES;

export function isSource(v: string): v is Source {
  return Object.hasOwn(SOURCES, v);
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

export type SourceValues = { attendeeName: string; eventName: string; eventDates: string; venue: string };

/** The value one variable takes for one attendee. */
export function sourceValue(source: Source, v: SourceValues, custom: string): string {
  switch (source) {
    case "attendee_name": return v.attendeeName;
    case "event_name": return v.eventName;
    case "event_dates": return v.eventDates;
    case "venue": return v.venue;
    case "custom": return custom;
  }
}

/** A text with its `{{n}}` replaced, 1-based. A missing value leaves the placeholder showing. */
export function fillVariables(text: string, values: string[]): string {
  return text.replace(VAR, (whole, n) => values[Number(n) - 1] || whole);
}
