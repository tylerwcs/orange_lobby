/**
 * A polaroid's proportions (D483), all as fractions of the card's width so the phone, the LED
 * and admin draw the same card at any size: an even border on the top and sides, the photo box,
 * and a deeper strip at the bottom for the message.
 */
export const CARD = { border: 0.055, strip: 0.27 } as const;
export const PHOTO_INNER = 1 - 2 * CARD.border;

/** D477: the photo box's height ÷ width stops at 16:9 either way; the photo is never cropped. */
export const MIN_PHOTO_RATIO = 9 / 16;
export const MAX_PHOTO_RATIO = 16 / 9;

export function photoBoxRatio(w: number, h: number): number {
  if (!(w > 0 && h > 0)) return 1;
  return Math.min(MAX_PHOTO_RATIO, Math.max(MIN_PHOTO_RATIO, h / w));
}

/** The whole card's height ÷ width. */
export function cardRatio(w: number, h: number): number {
  return CARD.border + PHOTO_INNER * photoBoxRatio(w, h) + CARD.strip;
}

/** The message's size against its base (8.5% of the card width), so 80 characters still fit two lines. */
export function messageScale(length: number): number {
  return length <= 24 ? 1 : length <= 48 ? 0.8 : 0.66;
}

/** D483: a small random tilt, set by the server so every screen shows the same one. */
export function randomTilt(rand: () => number = Math.random): number {
  return Math.round((rand() * 6 - 3) * 100) / 100;
}
