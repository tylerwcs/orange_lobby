export type ImageTarget = { ratio: number; minWidth: number; best: string; note: string; label: string };

/** The image guide's sizes for the images Basics takes (D447). */
export const IMAGE_TARGETS = {
  logo: { ratio: 1, minWidth: 256, best: "512 × 512", note: "Square, transparent PNG. Shown in the header and on the LED screen.", label: "Logos" },
  banner: { ratio: 3, minWidth: 1200, best: "2400 × 800", note: "3:1, keep text away from the edges.", label: "Banners" },
} as const satisfies Record<string, ImageTarget>;

const RATIO_SLACK = 0.05;

/** A sentence when an image will be cropped or look blurry; null when it's fine. Never blocks. */
export function proportionWarning(width: number, height: number, target: ImageTarget): string | null {
  if (!width || !height) return null;
  if (Math.abs(width / height - target.ratio) / target.ratio > RATIO_SLACK) {
    const shape = target.ratio === 1 ? "square" : `${target.ratio}:1`;
    return `This image is ${width} × ${height}. ${target.label} are cropped to ${shape}, so some of it will be cut off. Best: ${target.best}.`;
  }
  if (width < target.minWidth) return `This image is only ${width} px wide, so it may look blurry. Best: ${target.best}.`;
  return null;
}

/**
 * Images the previous answers used that the new answers don't, minus any still needed (the
 * submitted or applied snapshot, or the live event). Those are safe to delete from storage.
 */
export function droppedImages(
  before: Record<string, string> | null,
  after: Record<string, string>,
  fields: readonly string[],
  keep: readonly (string | null | undefined)[],
): string[] {
  if (!before) return [];
  const kept = new Set(keep.filter((k): k is string => !!k));
  const now = new Set(fields.map((f) => after[f]).filter(Boolean));
  return fields.map((f) => before[f]).filter((u): u is string => !!u && !now.has(u) && !kept.has(u));
}
