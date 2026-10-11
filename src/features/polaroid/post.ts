import "server-only";
import { randomUUID } from "node:crypto";
import { MAX_POLAROID_BYTES, isOwnPolaroidPath, polaroidFolder, polaroidPhotoPath } from "@/lib/storage";
import type { Activity, Event } from "@/lib/types";
import { createPhotoUpload, deletePhotos, insertPolaroid, recentPosts, uploadedSize } from "./db/polaroids";
import { posterKeys } from "./identity";
import { cardRatio, randomTilt } from "./lib/card";
import { checkMessage } from "./lib/message";
import { cleanPlacements } from "./lib/placement";
import { HOUR_MS, waitSeconds } from "./lib/ratelimit";
import { readPolaroidSettings } from "./lib/settings";
import { stickerTray } from "./lib/stickers";
import { BAD_PHOTO, NOT_UPLOADED, TOO_BIG, photoSize, refusalFor, waitMessage } from "./lib/post-rules";
import type { PostInput, PostResult, StartResult } from "./lib/post-types";

/** Who is posting where. `attendeeId` null is a walk-in (D481). */
export type PostContext = { event: Pick<Event, "id" | "org_id" | "status">; activity: Activity; attendeeId: string | null };

const where = (ctx: PostContext) => ({ orgId: ctx.event.org_id, eventId: ctx.event.id, activityId: ctx.activity.id });

async function waitFor(ctx: PostContext, keys: { clientKey: string; ipHash: string }): Promise<number> {
  const recent = await recentPosts(ctx.activity.id, new Date(Date.now() - HOUR_MS).toISOString());
  return waitSeconds(recent, { attendeeId: ctx.attendeeId, ...keys }, Date.now());
}

/** D478 step 1: refuse early, before the phone spends its upload, or mint a signed URL for a fresh path. */
export async function startPolaroid(ctx: PostContext): Promise<StartResult> {
  const no = refusalFor(ctx.event, ctx.activity, ctx.attendeeId === null);
  if (no) return { ok: false, error: no };
  const wait = await waitFor(ctx, await posterKeys());
  if (wait > 0) return { ok: false, error: waitMessage(wait), wait };
  const path = polaroidPhotoPath(where(ctx), randomUUID());
  return { ok: true, path, token: await createPhotoUpload(path) };
}

/**
 * D478 step 3: everything again, because the browser can send anything. Then the row. A photo
 * uploaded but never posted stays in the bucket until the event is purged or deleted (D485).
 */
export async function postPolaroid(ctx: PostContext, input: PostInput): Promise<PostResult> {
  const no = refusalFor(ctx.event, ctx.activity, ctx.attendeeId === null);
  if (no) return { ok: false, error: no };
  if (typeof input?.path !== "string" || !isOwnPolaroidPath(polaroidFolder(where(ctx)), input.path)) return { ok: false, error: NOT_UPLOADED };
  const size = photoSize(input.width, input.height);
  if (!size) return { ok: false, error: BAD_PHOTO };

  const settings = readPolaroidSettings(ctx.activity.polaroid);
  const message = checkMessage(typeof input.message === "string" ? input.message : "", settings.blocked_words);
  if (!message.ok) return message;
  const placed = cleanPlacements(input.stickers, new Set(stickerTray(settings).map((s) => s.id)), cardRatio(size.w, size.h));
  if (!placed.ok) return placed;

  const keys = await posterKeys();
  const wait = await waitFor(ctx, keys);
  if (wait > 0) return { ok: false, error: waitMessage(wait), wait };

  const bytes = await uploadedSize(input.path);
  if (bytes === null) return { ok: false, error: NOT_UPLOADED };
  if (bytes > MAX_POLAROID_BYTES) {
    await deletePhotos([input.path]);
    return { ok: false, error: TOO_BIG };
  }

  const id = await insertPolaroid({
    event_id: ctx.event.id, activity_id: ctx.activity.id, attendee_id: ctx.attendeeId,
    photo_path: input.path, photo_w: size.w, photo_h: size.h,
    message: message.message, stickers: placed.stickers, tilt: randomTilt(),
    client_key: keys.clientKey, ip_hash: keys.ipHash,
  });
  return id ? { ok: true, id } : { ok: false, error: "That polaroid is already on the wall." };
}
