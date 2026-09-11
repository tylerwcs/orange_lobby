import { slugify } from "@/lib/slug";

/** A per-attendee PNG name that is safe on every filesystem and unique within an export. */
export function safeFileName(name: string, id: string): string {
  return `${slugify(name) || "attendee"}-${id.replace(/-/g, "").slice(0, 6)}.png`;
}
