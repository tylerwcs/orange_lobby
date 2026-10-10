import { isEventMediaFor } from "@/lib/storage";
import { BASICS_IMAGE_FIELDS, type BasicsAnswers } from "./sections/basics";

type BasicsImageField = (typeof BASICS_IMAGE_FIELDS)[number];

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

/** The event an image rule checks against: its folder in the bucket and the images it shows now. */
export type ImageEvent = { org_id: string; id: string; logo_url: string | null; banner_url: string | null };

const KIND_OF: Record<BasicsImageField, "logo" | "banner"> = { logo_url: "logo", banner_url: "banner" };

/**
 * An image answer counts only if it is this event's own upload of the right kind, or the image
 * the event shows now (the form starts from it, and it may predate the bucket's naming); any
 * other URL is blanked, so a save can never adopt another event's file (D447).
 */
export function ownImageAnswers(answers: BasicsAnswers, ev: ImageEvent, supabaseUrl: string): BasicsAnswers {
  const out = { ...answers };
  for (const f of BASICS_IMAGE_FIELDS) {
    if (out[f] && out[f] !== ev[f] && !isEventMediaFor(out[f], supabaseUrl, ev.org_id, ev.id, [KIND_OF[f]])) out[f] = "";
  }
  return out;
}

/**
 * The draft images a save makes unused (D447): used by `prev`, not by `next`, not in `keep` (the
 * submitted and applied snapshots) and not live on the event - and only this event's own uploads,
 * since a kept live image may live anywhere.
 */
export function imagesToDeleteOnSave(
  prev: BasicsAnswers | null,
  next: BasicsAnswers,
  keep: readonly (string | null | undefined)[],
  ev: ImageEvent,
  supabaseUrl: string,
): string[] {
  return droppedImages(prev, next, BASICS_IMAGE_FIELDS, [...keep, ev.logo_url, ev.banner_url])
    .filter((url) => isEventMediaFor(url, supabaseUrl, ev.org_id, ev.id, ["logo", "banner"]));
}

/**
 * The live images an Apply replaces and may delete once the event points at the new ones: only
 * the image the organiser started from (`baseline`) and changed in this patch, never one the
 * admin put there since, never one the organiser's working draft still uses, and only this
 * event's own upload of that kind.
 */
export function imagesToDeleteOnApply(
  ev: ImageEvent,
  patch: Partial<Record<BasicsImageField, string | null>>,
  baseline: BasicsAnswers,
  workingAnswers: BasicsAnswers,
  supabaseUrl: string,
): string[] {
  return BASICS_IMAGE_FIELDS.flatMap((f) => {
    const old = ev[f];
    if (!(f in patch) || !old || old === patch[f] || old !== baseline[f] || old === workingAnswers[f]) return [];
    return isEventMediaFor(old, supabaseUrl, ev.org_id, ev.id, [KIND_OF[f]]) ? [old] : [];
  });
}
