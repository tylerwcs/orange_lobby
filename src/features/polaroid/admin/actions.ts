"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { generateToken } from "@/lib/tokens";
import { acceptImage, acceptVideo, isEventMediaFor } from "@/lib/storage";
import { createMediaUpload, deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { requireFeature } from "@/features/catalogue";
import type { Activity, Event } from "@/lib/types";
import { getPolaroidActivity, removePolaroid, savePolaroidSettings, setActivityToken } from "../db/polaroids";
import { parseBlockedWords, parseColumns, parseSpeed, readPolaroidSettings, type PolaroidSettings } from "../lib/settings";
import { BUILTIN_STICKERS, newEventStickerId } from "../lib/stickers";

const MAX_STICKER_BYTES = 1024 * 1024;
const STICKER_TYPES = new Set(["image/png", "image/webp", "image/svg+xml"]);

// This feature cannot import the activities feature (it imports us), so it builds its own paths.
const pageOf = (eventId: string, activityId: string, tab?: "polaroids" | "stickers") =>
  `/admin/events/${eventId}/activities/${activityId}${tab ? `?tab=${tab}` : ""}`;

async function wallOf(eventId: string, activityId: string): Promise<{ ev: Event; userId: string; activity: Activity; settings: PolaroidSettings }> {
  const { ev, actor } = await requireEventAccess(eventId);
  const list = `/admin/events/${eventId}/activities`;
  await requireFeature(ev.id, "engagement", list);
  const activity = await getPolaroidActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(list, "That polaroid wall no longer exists.", "error"));
  return { ev, userId: actor.userId, activity, settings: readPolaroidSettings(activity.polaroid) };
}

async function saved(ev: Event, activity: Activity, next: PolaroidSettings, back: string, message: string): Promise<never> {
  await savePolaroidSettings(activity.id, ev.id, next);
  revalidatePath(back);
  redirect(flashPath(back, message));
}

/** D485: walk-in link, blocked words, columns, speed and background, in one save. */
export async function saveWallSettingsAction(eventId: string, activityId: string, fd: FormData) {
  const back = pageOf(eventId, activityId);
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  const type = String(fd.get("background_type") ?? "none");
  const url = String(fd.get("background_url") ?? "");
  let background = settings.background;
  if (type === "none") background = null;
  else if ((type === "image" || type === "video") && url) {
    // A hidden field is client-controlled: only a background WE stored for this event is taken (D300).
    if (!isEventMediaFor(url, process.env.NEXT_PUBLIC_SUPABASE_URL!, ev.org_id, ev.id, ["polaroid-background"])) {
      redirect(flashPath(back, "That background was not uploaded here. Upload it again.", "error"));
    }
    background = { type, url };
  }
  const next: PolaroidSettings = {
    ...settings,
    public: fd.get("public") !== null,
    blocked_words: parseBlockedWords(String(fd.get("blocked_words") ?? "")),
    columns: parseColumns(String(fd.get("columns") ?? "auto")),
    speed: parseSpeed(String(fd.get("speed") ?? "medium")),
    background,
  };
  await savePolaroidSettings(activity.id, ev.id, next);
  // Only after the save: a failed save must not leave the wall pointing at a deleted file.
  if (settings.background && settings.background.url !== background?.url) await deleteEventImage(settings.background.url);
  revalidatePath(back);
  redirect(flashPath(back, "Wall settings saved."));
}

/** A background image or video goes straight to the bucket on a signed URL (D300); Save then keeps its URL. */
export async function wallBackgroundUploadAction(eventId: string, activityId: string, type: string, size: number):
  Promise<{ ok: true; path: string; token: string; url: string; kind: "image" | "video" } | { ok: false; error: string }> {
  const { ev } = await wallOf(eventId, activityId);
  const video = type.startsWith("video/");
  let ext: string;
  try {
    ext = video ? acceptVideo({ type, size }) : acceptImage({ type, size });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const up = await createMediaUpload({ orgId: ev.org_id, eventId: ev.id, kind: "polaroid-background", ext });
  return { ok: true, ...up, kind: video ? "video" : "image" };
}

/** D473: final. The wall drops it on its next poll; the photo is deleted. */
export async function removePolaroidAction(eventId: string, activityId: string, polaroidId: string) {
  const back = pageOf(eventId, activityId, "polaroids");
  const { userId, activity } = await wallOf(eventId, activityId);
  const removed = await removePolaroid(polaroidId, activity.id, `admin:${userId}`);
  revalidatePath(back);
  redirect(flashPath(back, removed ? "Removed from the wall." : "That polaroid was already removed. Its photo file has been deleted."));
}

async function rotate(eventId: string, activityId: string, column: "wall_token" | "public_token", message: string) {
  const back = pageOf(eventId, activityId);
  const { ev, activity } = await wallOf(eventId, activityId);
  await setActivityToken(activity.id, ev.id, column, generateToken());
  revalidatePath(back);
  redirect(flashPath(back, message));
}

export async function rotateWallLinkAction(eventId: string, activityId: string) {
  await rotate(eventId, activityId, "wall_token", "New wall link made. Open it on the LED; the old one has stopped.");
}

export async function rotateWalkinLinkAction(eventId: string, activityId: string) {
  await rotate(eventId, activityId, "public_token", "New walk-in link made. The wall's QR has changed; the old link has stopped.");
}

/** D485: an event sticker, PNG, WebP or SVG up to 1 MB. Rendered only in <img>, so SVG is safe (acceptImage). */
export async function addStickerAction(eventId: string, activityId: string, fd: FormData) {
  const back = pageOf(eventId, activityId, "stickers");
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  const file = fd.get("sticker");
  if (!(file instanceof File) || file.size === 0) redirect(flashPath(back, "Choose a sticker image first.", "error"));
  if (!STICKER_TYPES.has(file.type.toLowerCase())) redirect(flashPath(back, "Stickers must be PNG, WebP or SVG.", "error"));
  if (file.size > MAX_STICKER_BYTES) redirect(flashPath(back, "Stickers must be 1 MB or smaller.", "error"));
  if (settings.stickers.length >= 40) redirect(flashPath(back, "A wall can have up to 40 event stickers.", "error"));
  const url = await uploadEventImage({ orgId: ev.org_id, eventId: ev.id, kind: "polaroid-sticker", file });
  const name = String(fd.get("name") ?? "").trim().slice(0, 60) || file.name.replace(/\.[^.]*$/, "").slice(0, 60) || "Sticker";
  await saved(ev, activity, { ...settings, stickers: [...settings.stickers, { id: newEventStickerId(), url, name }] }, back, "Sticker added.");
}

/** Polaroids already using it draw without it (D476). */
export async function deleteStickerAction(eventId: string, activityId: string, stickerId: string) {
  const back = pageOf(eventId, activityId, "stickers");
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  const doomed = settings.stickers.find((s) => s.id === stickerId);
  if (!doomed) redirect(flashPath(back, "That sticker was already deleted."));
  await savePolaroidSettings(activity.id, ev.id, { ...settings, stickers: settings.stickers.filter((s) => s.id !== stickerId) });
  await deleteEventImage(doomed.url);
  revalidatePath(back);
  redirect(flashPath(back, "Sticker deleted."));
}

export async function toggleBuiltinStickerAction(eventId: string, activityId: string, stickerId: string) {
  const back = pageOf(eventId, activityId, "stickers");
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  if (!BUILTIN_STICKERS.some((s) => s.id === stickerId)) redirect(flashPath(back, "That sticker is not in the pack.", "error"));
  const hidden = settings.hidden_builtin.includes(stickerId)
    ? settings.hidden_builtin.filter((id) => id !== stickerId)
    : [...settings.hidden_builtin, stickerId];
  await saved(ev, activity, { ...settings, hidden_builtin: hidden }, back, hidden.includes(stickerId) ? "Sticker hidden." : "Sticker shown.");
}
