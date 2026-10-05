import type { ActivitySubmission, RegistrationQuestion } from "@/lib/types";

/**
 * D396: a fingerprint of each uploaded file, so the same screenshot sent twice can be refused.
 * Every duplicate seen in Project Mileage's first week was the identical file re-sent within a
 * minute or two; a fresh screenshot of the same walk is different bytes and is left to the
 * committee's revoke. Stored per question key (`activity_submissions.file_hashes`), so an edit
 * that replaces one photo replaces only that photo's fingerprint.
 */
export type FileHashes = Record<string, string>;

/** SHA-256 of the bytes, as lowercase hex. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether any of `hashes` is already a file in one of `entries` that still counts. Revoked rows
 * do not count (a revoked mistake may be sent again); `exceptId` is the entry being edited.
 * Rows sent before fingerprints existed have none, and match nothing.
 */
export function sharesFile(
  hashes: FileHashes,
  entries: (Pick<ActivitySubmission, "id" | "status"> & { file_hashes: FileHashes | null })[],
  exceptId?: string,
): boolean {
  const wanted = new Set(Object.values(hashes));
  if (wanted.size === 0) return false;
  return entries.some((e) => e.id !== exceptId && e.status === "submitted"
    && Object.values(e.file_hashes ?? {}).some((h) => wanted.has(h)));
}

/**
 * An edited row's fingerprints: a file question with a fresh upload takes the new one, a file
 * left exactly as it was keeps its old one, and anything else (cleared, hidden) has none.
 */
export function nextFileHashes(
  questions: RegistrationQuestion[],
  before: Record<string, string>,
  beforeHashes: FileHashes | null,
  after: Record<string, string>,
  fresh: FileHashes,
): FileHashes {
  const out: FileHashes = {};
  for (const q of questions) {
    if (q.type !== "file") continue;
    // Own properties only: a question keyed "constructor" must not read Object.prototype's.
    const own = (o: Record<string, string> | null) => (o && Object.hasOwn(o, q.key) ? o[q.key] : "");
    const path = own(after);
    const kept = path && path === own(before) ? own(beforeHashes) : "";
    const hash = own(fresh) || kept;
    if (hash && path) out[q.key] = hash;
  }
  return out;
}
