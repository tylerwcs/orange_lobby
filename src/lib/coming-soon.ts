import type { Event } from "@/lib/types";

/** What a draft event's links say when the organiser has not written their own (D617). */
export const DEFAULT_COMING_SOON = "Coming soon. Check back closer to the event.";

/** D617: the organiser's Coming soon message, or the default when blank. */
export function comingSoonMessage(e: Pick<Event, "coming_soon_message">): string {
  return e.coming_soon_message?.trim() || DEFAULT_COMING_SOON;
}
