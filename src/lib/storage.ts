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
export type ImageKind = "logo" | "banner" | "floor-plan";

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
