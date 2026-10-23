import type { CardSettings } from "./settings";

/**
 * D718: how a wall's polaroids are printed, worked out once from its settings so every screen
 * draws the same card: a background image in place of the white frame, a logo under the message,
 * and the message's colour.
 */
export type CardLook = { background: string | null; logo: string | null; ink: string };

/** The message's colour on the plain white polaroid. */
export const PLAIN_INK = "#2b2b2b";
/** The message's colour on a print background: key visuals are mostly dark, and the admin picks another. */
const LIGHT_INK = "#ffffff";

export const PLAIN_LOOK: CardLook = { background: null, logo: null, ink: PLAIN_INK };

/**
 * The colour the message gets when the admin has not picked one: dark grey on the white polaroid,
 * white on a print background. Not the event's colour: that is often the client's brand blue, not
 * a colour that reads on their key visual.
 */
export function autoInk(background: string | null): string {
  return background ? LIGHT_INK : PLAIN_INK;
}

export function cardLook(card: CardSettings): CardLook {
  return { background: card.background, logo: card.logo, ink: card.ink ?? autoInk(card.background) };
}
