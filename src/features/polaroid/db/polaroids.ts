import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import { sweepPolaroidPrefix } from "@/lib/db/media";
import { POLAROID_BUCKET, polaroidFolder } from "@/lib/storage";
import type { Activity } from "@/lib/types";
import type { StickerPlacement } from "../lib/placement";
import type { RecentPost } from "../lib/ratelimit";
import type { PolaroidSettings } from "../lib/settings";

export type PolaroidRow = {
  id: string;
  event_id: string;
  activity_id: string;
  attendee_id: string | null;
  photo_path: string;
  photo_w: number;
  photo_h: number;
  message: string;
  stickers: StickerPlacement[];
  tilt: number;
  status: "live" | "removed";
  removed_by: string | null;
  removed_at: string | null;
  created_at: string;
};

export type NewPolaroid = Pick<PolaroidRow, "event_id" | "activity_id" | "attendee_id" | "photo_path" | "photo_w" | "photo_h" | "message" | "stickers" | "tilt"> & {
  client_key: string;
  ip_hash: string;
};

// Never the client_key or ip_hash: nothing outside the rate limit reads them.
const COLUMNS = "id, event_id, activity_id, attendee_id, photo_path, photo_w, photo_h, message, stickers, tilt, status, removed_by, removed_at, created_at";
const polaroids = () => serviceClient().from("polaroids");
const bucket = () => serviceClient().storage.from(POLAROID_BUCKET);

export function photoUrl(path: string): string {
  return bucket().getPublicUrl(path).data.publicUrl;
}

export async function getPolaroidActivity(id: string, eventId: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*").eq("id", id).eq("event_id", eventId).eq("kind", "polaroid").maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

/** The polaroid activity a wall or walk-in token names (D474). */
export async function activityByToken(column: "wall_token" | "public_token", token: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*").eq(column, token).eq("kind", "polaroid").maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

/** Oldest first: the wall assigns columns in posting order. Paged (D401). */
export async function livePolaroids(activityId: string): Promise<PolaroidRow[]> {
  return selectAll<PolaroidRow>((from, to) => polaroids().select(COLUMNS).eq("activity_id", activityId).eq("status", "live")
    .order("created_at").order("id").range(from, to));
}

/** Newest first, removed ones included, for the moderation feed. */
export async function polaroidsForAdmin(activityId: string): Promise<PolaroidRow[]> {
  return selectAll<PolaroidRow>((from, to) => polaroids().select(COLUMNS).eq("activity_id", activityId)
    .order("created_at", { ascending: false }).order("id").range(from, to));
}

/** An attendee's own live polaroids, newest first, for "Your polaroids". */
export async function polaroidsForAttendee(attendeeId: string): Promise<PolaroidRow[]> {
  const { data, error } = await polaroids().select(COLUMNS).eq("attendee_id", attendeeId).eq("status", "live")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as PolaroidRow[];
}

export async function countLiveByActivity(eventId: string): Promise<Record<string, number>> {
  const rows = await selectAll<{ activity_id: string }>((from, to) => polaroids().select("activity_id").eq("event_id", eventId).eq("status", "live").order("id").range(from, to));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.activity_id] = (out[r.activity_id] ?? 0) + 1;
  return out;
}

export async function countByActivity(activityId: string): Promise<number> {
  const { count, error } = await polaroids().select("id", { count: "exact", head: true }).eq("activity_id", activityId);
  if (error) throw error;
  return count ?? 0;
}

/** The last hour of one activity's posts, for `waitSeconds` (D480). */
export async function recentPosts(activityId: string, since: string): Promise<RecentPost[]> {
  const { data, error } = await polaroids().select("created_at, attendee_id, client_key, ip_hash").eq("activity_id", activityId).gte("created_at", since).limit(5000);
  if (error) throw error;
  return (data ?? []) as RecentPost[];
}

export async function getPolaroid(id: string, activityId: string): Promise<PolaroidRow | null> {
  const { data, error } = await polaroids().select(COLUMNS).eq("id", id).eq("activity_id", activityId).maybeSingle();
  if (error) throw error;
  return (data as PolaroidRow | null) ?? null;
}

/** The new row's id, or null when this photo was already posted (photo_path is unique). */
export async function insertPolaroid(row: NewPolaroid): Promise<string | null> {
  const { data, error } = await polaroids().insert(row).select("id").single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * D473: final. The status flips first, so the wall drops it on its next poll even if the file
 * delete fails and has to be retried; then the photo itself goes. False if it was already gone.
 */
export async function removePolaroid(id: string, activityId: string, by: string): Promise<boolean> {
  const { data, error } = await polaroids().update({ status: "removed", removed_by: by, removed_at: new Date().toISOString() })
    .eq("id", id).eq("activity_id", activityId).eq("status", "live").select("photo_path");
  if (error) throw error;
  const row = (data ?? [])[0] as { photo_path: string } | undefined;
  if (!row) return false;
  await deletePhotos([row.photo_path]);
  return true;
}

/** D478: a signed upload URL's token for one fresh path; the browser uploads straight to the bucket. */
export async function createPhotoUpload(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not start the upload. Try again.");
  return data.token;
}

/** The uploaded object's size in bytes, or null if nothing is there. */
export async function uploadedSize(path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data, error } = await bucket().list(path.slice(0, slash), { search: name, limit: 1 });
  if (error) throw error;
  const hit = (data ?? []).find((o) => o.name === name);
  const size = (hit?.metadata as { size?: unknown } | null | undefined)?.size;
  return typeof size === "number" ? size : null;
}

export async function deletePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw error;
}

export async function savePolaroidSettings(activityId: string, eventId: string, settings: PolaroidSettings): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ polaroid: settings }).eq("id", activityId).eq("event_id", eventId).eq("kind", "polaroid");
  if (error) throw error;
}

/** Rotation IS the revocation (D108, D252): the old link stops the moment this lands. */
export async function setActivityToken(activityId: string, eventId: string, column: "wall_token" | "public_token", token: string): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ [column]: token }).eq("id", activityId).eq("event_id", eventId).eq("kind", "polaroid");
  if (error) throw error;
}

/** One activity's photos, before its row (and with it, by cascade, its polaroids) is deleted. */
export async function sweepActivityPhotos(orgId: string, eventId: string, activityId: string): Promise<void> {
  await sweepPolaroidPrefix(polaroidFolder({ orgId, eventId, activityId }).slice(0, -1));
}

/** Purge personal data (D485): every photo, then every row. Files first, as the attendee purge does. */
export async function purgePolaroids(orgId: string, eventId: string): Promise<void> {
  await sweepPolaroidPrefix(`${orgId}/${eventId}`);
  const { error } = await polaroids().delete().eq("event_id", eventId);
  if (error) throw error;
}
