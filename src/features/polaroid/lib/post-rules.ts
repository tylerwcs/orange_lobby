import { readPolaroidSettings } from "./settings";

export const PAUSED = "Posting is paused right now.";
export const OVER = "This event is over.";
export const LINK_OFF = "This link isn't taking posts right now.";
export const GONE = "This page has expired. Reload it and try again.";
export const NOT_UPLOADED = "That photo didn't upload. Try again.";
export const TOO_BIG = "That photo is too big. Try a different photo.";
export const BAD_PHOTO = "That photo can't be opened here. Try a different photo.";

export function waitMessage(seconds: number): string {
  return `You can post again in ${seconds} s.`;
}

/**
 * Why a post is refused before anything else is checked, or null (D478, D481). A draft event is
 * not refused here: organisers test through the portal before publishing, as for bookings. The
 * walk-in page refuses drafts itself, because it is public.
 */
export function refusalFor(event: { status: string }, activity: { is_open: boolean; polaroid?: unknown }, walkIn: boolean): string | null {
  if (event.status === "archived") return OVER;
  if (!activity.is_open) return PAUSED;
  if (walkIn && !readPolaroidSettings(activity.polaroid).public) return LINK_OFF;
  return null;
}

/** The photo's reported size, as whole pixels from 1 to 4000, or null. It only sizes the card. */
export function photoSize(w: unknown, h: unknown): { w: number; h: number } | null {
  if (typeof w !== "number" || typeof h !== "number") return null;
  const rw = Math.round(w);
  const rh = Math.round(h);
  return rw >= 1 && rw <= 4000 && rh >= 1 && rh <= 4000 ? { w: rw, h: rh } : null;
}
