/**
 * The rules for the images an organiser uploads — which files are allowed, what they are
 * called in the bucket, and how to read an object path back out of a stored URL.
 *
 * Pure on purpose: the columns still hold plain URLs, so everything that decides anything
 * about an image can be tested without a Supabase client. The upload itself lives in
 * src/lib/db/media.ts.
 */

/** The one bucket every event image lives in. Public read; only the service role writes. */
export const MEDIA_BUCKET = "event-media";

/** Per file. Two images can post in one Settings save, under the 10 MB Server Action cap. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** What an uploaded image is for. Also the first half of its object name. */
export type ImageKind = "logo" | "banner" | "floor-plan" | "agenda" | "agenda-banner" | "info" | "activity";

/**
 * The extension each accepted type is stored under. Browsers send `image/jpg` as well as
 * `image/jpeg`, and both are stored as `.jpg` — the extension is ours to choose, and one
 * spelling means one thing to look at in the bucket.
 */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/**
 * The gate every upload passes: returns the extension to store the file under, or throws
 * the sentence the organiser will read in the red flash.
 *
 * SVG is allowed because floor plans are often vector. It is safe here and nowhere else:
 * these images are only ever rendered in an `<img>`, which does not run scripts, and they
 * are served from the Supabase domain rather than ours.
 */
export function acceptImage(file: { type: string; size: number }): string {
  if (file.size === 0) throw new Error("Choose an image first.");
  const ext = EXTENSIONS[file.type.toLowerCase()];
  if (!ext) throw new Error("Images must be PNG, JPEG, WebP or SVG.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 4 MB or smaller.");
  return ext;
}

/**
 * What one image field on a saved form asks for. Three answers, and the third is the one
 * worth naming: a form that posts an untouched file input is saying nothing about that image,
 * so the stored one survives - without this, a form that writes every column every time would
 * blank the image of anyone who only came to change the text beside it.
 *
 * A picked file wins over a ticked remove box: `ImageField` gives Remove way to a replacement,
 * and a replacement is the newer of the two answers.
 */
export type ImageIntent = { action: "upload"; file: File } | { action: "remove" } | { action: "keep" };

export function imageIntent(formData: FormData, name: string): ImageIntent {
  const file = formData.get(name);
  if (file instanceof File && file.size > 0) return { action: "upload", file };
  if (formData.get(`${name}_remove`) === "on") return { action: "remove" };
  return { action: "keep" };
}

/**
 * Where one image lives in the bucket.
 *
 * `id` is supplied by the caller rather than generated here, both because a pure function
 * is the wrong place for randomness and because it is what makes a replacement a new URL:
 * no browser or CDN can serve the image this one replaced.
 */
export function mediaObjectPath(
  input: { orgId: string; eventId: string; kind: ImageKind; ext: string },
  id: string,
): string {
  return `${input.orgId}/${input.eventId}/${input.kind}-${id}.${input.ext}`;
}

/**
 * The object path inside a URL we stored, or null if the URL points anywhere else.
 *
 * Null is the answer that matters: it is how a link an organiser pasted before uploads
 * existed gets dropped on replacement rather than chased, and how a URL naming some other
 * bucket is never handed to a delete.
 */
export function mediaPathFromUrl(url: string, supabaseUrl: string): string | null {
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  return path ? decodeURIComponent(path) : null;
}

/**
 * The `accept` attribute for every image picker in the admin. Derived from the same map
 * the upload gate reads, so the file chooser can never offer a type the save would reject.
 */
export const IMAGE_ACCEPT = Object.keys(EXTENSIONS).join(",");

/**
 * The one bucket every submitted `file` answer lives in. Private, unlike MEDIA_BUCKET (D168):
 * an attendee's photo or receipt is not a logo, and "nobody will guess the filename" is not
 * access control. Reads go through signedSubmissionUrl instead — see media.ts.
 */
export const SUBMISSION_BUCKET = "form-uploads";

/** Per file. Generous next to MAX_IMAGE_BYTES because a receipt scan is not a logo. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * The extension each accepted submission type is stored under. Kept apart from EXTENSIONS —
 * see acceptUpload — even though it happens to be a superset today: the two lists answer
 * different questions and must be free to diverge.
 */
const UPLOAD_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * The gate every submitted `file` answer passes: returns the extension to store the file
 * under, or throws the sentence the attendee will read in the red flash.
 *
 * Deliberately a separate list from acceptImage rather than a widening of it: a PDF is a
 * reasonable thing to attach to a form, but an event logo must never be one. Merging the two
 * accept lists would let somebody upload a PDF as a logo the moment this function existed.
 */
export function acceptUpload(file: { type: string; size: number }): string {
  if (file.size === 0) throw new Error("Choose a file first.");
  const ext = UPLOAD_EXTENSIONS[file.type.toLowerCase()];
  if (!ext) throw new Error("Files must be PNG, JPEG, WebP or PDF.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller.");
  return ext;
}

/**
 * Where one submitted file lives in the bucket — under its own event and form, so two forms
 * on the same event never collide and a form's files are easy to find (and delete) together.
 *
 * `id` is supplied by the caller for the same reason mediaObjectPath's is: a pure function is
 * the wrong place for randomness.
 */
export function submissionObjectPath(
  input: { orgId: string; eventId: string; formId: string; ext: string },
  id: string,
): string {
  return `${input.orgId}/${input.eventId}/${input.formId}/submission-${id}.${input.ext}`;
}

/**
 * The `accept` attribute for every file picker on a `file` question. Derived from the same
 * map acceptUpload reads, so the picker can never offer a type the upload would reject.
 */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_EXTENSIONS).join(",");
