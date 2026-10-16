import type { Event } from "@/lib/types";

/** D633: more than this and the event bar starts clipping the name. */
const MAX_LINES = 3;

/**
 * D633: the event name as the organiser wants it broken onto lines, from Settings. Each line is
 * tidied and blank lines dropped. Null when blank or no different from the plain name, so the
 * portal keeps using `name` (and the browser's own wrapping) until someone actually sets breaks.
 */
export function parseDisplayName(raw: string | null | undefined, name: string): string | null {
  const lines = (raw ?? "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_LINES);
  const shown = lines.join("\n");
  return shown === "" || shown === name.trim() ? null : shown;
}

/**
 * D633: the name for the big page title attendees see - the Coming soon card - with the
 * organiser's line breaks (render it with `whitespace-pre-line`). Sentences, tab titles,
 * WhatsApp and exports keep the plain `name`; the top bar follows `barName`.
 */
export function shownName(e: Pick<Event, "name"> & { display_name?: string | null }): string {
  return e.display_name || e.name;
}

/** D635: the top bar's name - the organiser's line breaks only when they ask for them there too. */
export function barName(e: Pick<Event, "name"> & { display_name?: string | null; display_name_in_bar?: boolean }): string {
  return e.display_name_in_bar ? shownName(e) : e.name;
}
