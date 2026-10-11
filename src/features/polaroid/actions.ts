"use server";
import { revalidatePath } from "next/cache";
import { portalContext, walkinContext } from "./context";
import { getPolaroid, removePolaroid } from "./db/polaroids";
import { postPolaroid, startPolaroid } from "./post";
import { GONE } from "./lib/post-rules";
import type { PostInput, PostResult, RemoveResult, StartResult } from "./lib/post-types";

// Returns, never redirects: the composer is mid-flow and must keep the photo, text and stickers.
const portalPath = (slug: string, token: string, activityId: string) => `/e/${slug}/a/${token}/activities/${activityId}`;

export async function startPortalPolaroidAction(slug: string, token: string, activityId: string): Promise<StartResult> {
  const ctx = await portalContext(slug, token, activityId);
  return ctx ? startPolaroid(ctx) : { ok: false, error: GONE };
}

export async function postPortalPolaroidAction(slug: string, token: string, activityId: string, input: PostInput): Promise<PostResult> {
  const ctx = await portalContext(slug, token, activityId);
  if (!ctx) return { ok: false, error: GONE };
  const r = await postPolaroid(ctx, input);
  if (r.ok) revalidatePath(portalPath(slug, token, activityId));
  return r;
}

/** D482: an attendee takes their own polaroid down. Works while posting is paused, too. */
export async function removeOwnPolaroidAction(slug: string, token: string, activityId: string, polaroidId: string): Promise<RemoveResult> {
  const ctx = await portalContext(slug, token, activityId);
  if (!ctx) return { ok: false, error: GONE };
  const row = await getPolaroid(polaroidId, ctx.activity.id);
  if (!row || row.attendee_id !== ctx.attendeeId || row.status !== "live") return { ok: false, error: "That polaroid is already gone." };
  await removePolaroid(row.id, ctx.activity.id, "self");
  revalidatePath(portalPath(slug, token, activityId));
  return { ok: true };
}

export async function startWalkinPolaroidAction(slug: string, publicToken: string): Promise<StartResult> {
  const ctx = await walkinContext(slug, publicToken);
  return ctx ? startPolaroid(ctx) : { ok: false, error: GONE };
}

export async function postWalkinPolaroidAction(slug: string, publicToken: string, input: PostInput): Promise<PostResult> {
  const ctx = await walkinContext(slug, publicToken);
  return ctx ? postPolaroid(ctx, input) : { ok: false, error: GONE };
}
