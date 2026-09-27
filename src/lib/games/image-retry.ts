/** A failed LED picture load is retried this many times before it stays "no picture" (polish D323). */
export const IMAGE_RETRIES = 4;
const FIRST_RETRY_MS = 15_000;

/**
 * How long to wait before retrying a picture that has failed `failures` times (1 = the first
 * failure): 15 s, 30 s, 60 s, 120 s, then `null` — give up until the page reloads. The LED runs
 * for hours, so a blip in the venue's network shouldn't leave the plain card back up all night,
 * but a dead link shouldn't be fetched forever either.
 */
export function imageRetryDelay(failures: number): number | null {
  if (!Number.isInteger(failures) || failures < 1 || failures > IMAGE_RETRIES) return null;
  return FIRST_RETRY_MS * 2 ** (failures - 1);
}
