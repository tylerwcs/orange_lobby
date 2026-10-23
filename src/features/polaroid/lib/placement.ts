import { CARD, PHOTO_INNER, stripHeight } from "./card";

/** D476: a sticker on a card, in card widths: centre (x, y), width (scale), angle in degrees. */
export type StickerPlacement = { id: string; x: number; y: number; scale: number; rot: number };

export const MAX_STICKERS = 8;
export const MIN_SCALE = 0.08;
export const MAX_SCALE = 0.6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function normaliseAngle(deg: number): number {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Math.round(a * 10) / 10;
}

/** `ratio` is the card's height ÷ width (`cardRatio`), so y never leaves the card. */
export function clampPlacement(p: StickerPlacement, ratio: number): StickerPlacement {
  return {
    id: p.id,
    x: round4(clamp(p.x, 0, 1)),
    y: round4(clamp(p.y, 0, ratio)),
    scale: round4(clamp(p.scale, MIN_SCALE, MAX_SCALE)),
    rot: normaliseAngle(p.rot),
  };
}

/** Where a sticker lands when tapped in the tray: the middle of the photo, 22% of the card wide. */
export function newPlacement(id: string, ratio: number, logo = false): StickerPlacement {
  const photoMiddle = CARD.border + (ratio - CARD.border - stripHeight(logo)) / 2;
  return { id, x: 0.5, y: round4(Math.max(PHOTO_INNER / 4, photoMiddle)), scale: 0.22, rot: 0 };
}

export type PlacementCheck = { ok: true; stickers: StickerPlacement[] } | { ok: false; error: string };

const UNREADABLE = "Those stickers could not be read. Try again.";

/** The server's check (D476): at most 8, every id one the tray offers, every number finite, then clamped. */
export function cleanPlacements(raw: unknown, allowed: ReadonlySet<string>, ratio: number): PlacementCheck {
  if (!Array.isArray(raw)) return { ok: false, error: UNREADABLE };
  if (raw.length > MAX_STICKERS) return { ok: false, error: `Use up to ${MAX_STICKERS} stickers.` };
  const stickers: StickerPlacement[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return { ok: false, error: UNREADABLE };
    const { id, x, y, scale, rot } = r as Record<string, unknown>;
    if (typeof id !== "string" || !allowed.has(id)) return { ok: false, error: "One of those stickers is no longer available. Remove it and try again." };
    if (![x, y, scale, rot].every((n) => typeof n === "number" && Number.isFinite(n))) return { ok: false, error: UNREADABLE };
    stickers.push(clampPlacement({ id, x: x as number, y: y as number, scale: scale as number, rot: rot as number }, ratio));
  }
  return { ok: true, stickers };
}
