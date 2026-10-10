/** Per file (D459). Uploads go straight to the bucket, so the 4.5 MB request cap doesn't apply. */
export const SETUP_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_ITEM = 20;
export const NOTE_MAX = 4000;

/**
 * What organisers may send (D459), by extension. The content type is ours to choose: browsers
 * report CSV as anything from text/csv to application/vnd.ms-excel to nothing at all. No SVG.
 */
const TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The file picker's `accept`, from the same list the server checks. */
export const SETUP_FILE_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
/** The bucket's allowed types; 0073 lists the same ones. */
export const SETUP_FILE_TYPES = [...new Set(Object.values(TYPES))];

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";

/** The content type for an extension we accept; own keys only, so "constructor" is not a type. */
const typeOf = (ext: string): string | null => (Object.hasOwn(TYPES, ext) ? TYPES[ext] : null);

/** The extension a file is stored under and its content type, or the sentence the organiser reads. */
export function acceptSetupFile(f: { name: string; size: number }): { ok: true; ext: string; contentType: string } | { ok: false; message: string } {
  const ext = extOf(f.name);
  const contentType = typeOf(ext);
  if (!contentType) return { ok: false, message: "Send Excel, CSV, Word, PDF, PowerPoint, text or image files (PNG, JPEG, WebP)." };
  if (!(Number.isFinite(f.size) && f.size > 0)) return { ok: false, message: "That file is empty." };
  if (f.size > SETUP_FILE_MAX_BYTES) return { ok: false, message: "Files must be 25 MB or smaller." };
  return { ok: true, ext: ext === "jpeg" ? "jpg" : ext, contentType };
}

/** The content type a stored path's extension stands for; null for one we never mint. */
export function contentTypeFor(path: string): string | null {
  return typeOf(extOf(path));
}

/**
 * The name shown, and given to downloads: no folders, no control characters or quotes, at most 200
 * code points - the end kept, so the extension survives. Cut by code point, so an emoji is never split.
 */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return clean ? Array.from(clean).slice(-200).join("") : "file";
}

/** Where one setup file lives: under its event's folder, named by a fresh id (D459). */
export function setupFilePath(orgId: string, eventId: string, id: string, ext: string): string {
  return `${orgId}/${eventId}/${id}.${ext}`;
}

/** Whether `path` is one `setupFilePath` could have minted for this event: a lowercase uuid and a stored extension. Anything else is never recorded. */
export function isSetupFilePath(path: string, orgId: string, eventId: string): boolean {
  const prefix = `${orgId}/${eventId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/.test(rest) && contentTypeFor(rest) !== null;
}

export type ItemStatus = "empty" | "new" | "handled";

/**
 * Worked out, never stored (D458): nothing sent, something new since the admin last marked it
 * handled, or handled. Any file or note change bumps `updated_at`, which makes it new again.
 */
export function itemStatus(item: { notes: string; updated_at: string; handled_at: string | null } | null, fileCount: number): ItemStatus {
  if (fileCount === 0 && !item?.notes.trim()) return "empty";
  if (!item?.handled_at) return "new";
  return Date.parse(item.handled_at) >= Date.parse(item.updated_at) ? "handled" : "new";
}

export const ITEM_STATUS_ADMIN: Record<ItemStatus, string> = { empty: "Nothing sent", new: "New", handled: "Handled" };
export const ITEM_STATUS_ORGANISER: Record<ItemStatus, string> = { empty: "Not sent", new: "Sent", handled: "Received" };

/** A file as the browser sees it: no storage path. */
export type HubFile = { id: string; name: string; size_bytes: number; uploaded_at: string };

export function toHubFile(r: HubFile): HubFile {
  return { id: r.id, name: r.name, size_bytes: r.size_bytes, uploaded_at: r.uploaded_at };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
