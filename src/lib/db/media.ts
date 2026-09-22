import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import {
  MEDIA_BUCKET,
  SUBMISSION_BUCKET,
  acceptImage,
  acceptUpload,
  mediaObjectPath,
  mediaPathFromUrl,
  submissionObjectPath,
  type ImageKind,
} from "@/lib/storage";

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

/**
 * Stores one submitted file and returns its object path — never a URL. The bucket is private
 * (D168); a URL would need a signature to be worth anything, and a signature expires, so the
 * only thing safe to keep around is the path a signed URL can always be minted from again.
 *
 * Same shape as uploadEventImage otherwise: travels through the Server Action with the
 * service role, so the anon key can never write here either.
 */
export async function uploadSubmissionFile(input: {
  orgId: string;
  eventId: string;
  formId: string;
  file: File;
}): Promise<string> {
  const ext = acceptUpload(input.file);
  const path = submissionObjectPath(
    { orgId: input.orgId, eventId: input.eventId, formId: input.formId, ext },
    crypto.randomUUID().slice(0, 8),
  );
  const storage = serviceClient().storage.from(SUBMISSION_BUCKET);
  const { error } = await storage.upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (error) throw new Error("Could not upload that file. Try again.");
  return path;
}

/**
 * A link to one submitted file, good for a minute.
 *
 * Short on purpose. The bucket is private (D168) and this URL is the only way in, so its
 * lifetime is the window in which a leaked address is useful. A minute is plenty to click
 * a link on a page you are already looking at.
 */
export async function signedSubmissionUrl(path: string, seconds = 60): Promise<string | null> {
  const { data } = await serviceClient().storage.from(SUBMISSION_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/**
 * Removes submitted files from the bucket outright — unlike deleteEventImage there is no URL
 * to parse a path out of first, because nothing here ever stored one.
 */
export async function deleteSubmissionFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await serviceClient().storage.from(SUBMISSION_BUCKET).remove(paths);
}
