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
 *
 * Throws on a returned Storage error, unlike deleteEventImage: that function's silent-failure
 * choice is right for one replaceable logo, but wrong here. One of this function's callers is
 * the purge (src/lib/db/attendees.ts), which runs this before an irreversible database RPC
 * specifically so a failure here stops that RPC from ever running. A remove() that returns an
 * `error` instead of throwing one would defeat that ordering exactly as thoroughly as a remove()
 * that threw — the database would still end up saying "purged" over files still sitting in the
 * bucket, now with no submission row left to point at them. The other caller (the orphaned-
 * upload cleanup in the portal forms action) already wraps its own call in a try/catch that
 * swallows on purpose, so surfacing the error here changes nothing for it.
 */
export async function deleteSubmissionFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await serviceClient().storage.from(SUBMISSION_BUCKET).remove(paths);
  if (error) throw error;
}

/** `.list()`'s default page, and the size this walk pages by explicitly rather than trust the default. */
const LIST_PAGE = 100;

/**
 * Every object path under `prefix`, walking as deep as Storage's `.list()` requires.
 *
 * `.list()` is NOT recursive the way a filesystem `find` is: given `<org>/<event>`, it hands
 * back one entry named `<formId>` per form — a pseudo-folder, not the files inside it. Proven
 * against the live bucket rather than assumed: a folder entry comes back with `id: null`
 * (Storage never assigns an object id to a prefix, only to a real object), while a leaf file
 * entry always carries one. That is the one reliable way to tell "descend again" from "this is
 * an object", so every entry is checked rather than guessed from its name.
 *
 * `.list()` also pages (100 per call by default) rather than returning everything at once, so
 * a form with more than a page of uploads needs the offset loop below — stopping only once a
 * page comes back short, not after a fixed number of calls.
 */
async function listAllObjectPaths(bucket: string, prefix: string): Promise<string[]> {
  const storage = serviceClient().storage.from(bucket);
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await storage.list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) paths.push(...(await listAllObjectPaths(bucket, path)));
      else paths.push(path);
    }
    if (data.length < LIST_PAGE) break;
  }
  return paths;
}

/**
 * Removes every object under `prefix` from `form-uploads` — a sweep by object PATH rather
 * than by known answer, unlike deleteSubmissionFiles.
 *
 * Why this has to exist: answers are immutable (D166), but a question's KEY is not — the
 * admin editor lets an organiser rename a `file` question's key, or clear the key box so it
 * re-derives from the label. `fileQuestionKeys`/`filePathsForEvent` (src/lib/db/activities.ts) read
 * the form's CURRENT questions, so a rename stops them from recognising an OLD answer as a
 * file path at all — the object such an answer names would then never be handed to
 * deleteSubmissionFiles, and would sit in the bucket forever with nothing in the database
 * naming it. Deriving the sweep from `questions` some other way (e.g. unioning current keys
 * with whatever keys stored answers happen to use) only narrows the window: a key is mutable
 * by design, so anything keyed off it is one more rename away from the same bug.
 *
 * The object's PATH never moves when a key is renamed — `submissionObjectPath` builds it from
 * `<orgId>/<eventId>/<formId>/submission-<id>.<ext>` (src/lib/storage.ts), none of which is a
 * question key — so sweeping by prefix finds every object a form (or an event) ever produced
 * regardless of what its answer is keyed under today.
 *
 * Throws on a failed removal, like deleteSubmissionFiles and for the same reason: callers run
 * this before the write that makes the objects unfindable again (the form-delete, or the purge
 * RPC), specifically so a failure here stops that write from ever running. A swallowed failure
 * would report a clean purge or delete while orphaned files sat in the bucket with no row left
 * to name them by.
 */
export async function sweepSubmissionPrefix(prefix: string): Promise<void> {
  const paths = await listAllObjectPaths(SUBMISSION_BUCKET, prefix);
  if (paths.length === 0) return;
  const { error } = await serviceClient().storage.from(SUBMISSION_BUCKET).remove(paths);
  if (error) throw error;
}
