/**
 * D625: heading inks that follow the event's theme where one is set and leave everything else as
 * it was. `--heading` / `--card-heading` are only ever set on attendee pages (the theme engine,
 * src/features/theme); admin never sets them, so `inherit` keeps its headings in today's colour.
 */

/** A heading on the page ground (the event name in the bar). */
export const TITLE_INK = "text-[color:var(--heading,inherit)]";
/** A heading on a card: card titles, dialog, sheet and alert titles, field legends. */
export const CARD_TITLE_INK = "text-[color:var(--card-heading,inherit)]";
