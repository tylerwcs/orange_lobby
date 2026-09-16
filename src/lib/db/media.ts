import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { MEDIA_BUCKET, acceptImage, mediaObjectPath, mediaPathFromUrl, type ImageKind } from "@/lib/storage";

/**
 * Stores one uploaded image and returns the public URL the event column will hold.
 *
 * Uploads travel through the Server Action and are written with the service role, exactly
 * like the masterlist import — so the bucket needs no write policy and the anon key can
 * never put anything in it.
 *
 * Throws the sentence the organiser should read: acceptImage's for a file we will not take,
 * a general one for a bucket that refused it.
 */
export async function uploadEventImage(input: {
  orgId: string;
  eventId: string;
  kind: ImageKind;
  file: File;
}): Promise<string> {
  const ext = acceptImage(input.file);
  const path = mediaObjectPath({ orgId: input.orgId, eventId: input.eventId, kind: input.kind, ext }, crypto.randomUUID().slice(0, 8));
  const storage = serviceClient().storage.from(MEDIA_BUCKET);
  // A year's cache is safe because a replacement is a new object name, never a new body
  // at the same one.
  const { error } = await storage.upload(path, input.file, { contentType: input.file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Could not upload that image. Try again.");
  return storage.getPublicUrl(path).data.publicUrl;
}

/**
 * Removes the object a stored URL points at, if we are the ones who stored it.
 *
 * A URL an organiser pasted before uploads existed resolves to no path, and is simply
 * dropped — deleting an image is our business only inside our own bucket. A failed delete
 * is left alone: a stray object costs storage, while a save that fails because the tidy-up
 * did costs the organiser their work.
 */
export async function deleteEventImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = mediaPathFromUrl(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!path) return;
  await serviceClient().storage.from(MEDIA_BUCKET).remove([path]);
}
