import { eventThemeCss } from "./client";

/**
 * D625: the event's theme (and primary colour) as one `:root` rule. On `:root`, not a page root,
 * because dialogs, sheets and popovers render under <body> through portals, outside every page
 * root - and body's own `bg-background text-foreground` then follows the ground. Rendered once
 * by each attendee layout or page; an event with no theme gets exactly today's brand tokens.
 * If `cacheComponents` is ever enabled, a hidden route kept alive by <Activity> keeps its <style>
 * in the document, and a `:root` rule there still applies - check this before turning it on.
 */
export function ThemeStyle({ event }: { event: Parameters<typeof eventThemeCss>[0] }) {
  return <style>{eventThemeCss(event)}</style>;
}
