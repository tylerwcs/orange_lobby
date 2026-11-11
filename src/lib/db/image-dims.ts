import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { mediaPathFromUrl } from "@/lib/storage";
import type { ImageDims } from "@/lib/image-src";

/** URL → its recorded size, for the ones that have one. */
export type DimsByUrl = Record<string, ImageDims>;

/**
 * D895: the recorded size of each picture (image_dimensions), so the page can hold its space
 * before it arrives. One query for a page's pictures; a URL with no row, or not in our bucket,
 * is simply absent. Never throws - a page draws without reserved space rather than not at all.
 */
export async function loadImageDims(urls: readonly (string | null | undefined)[]): Promise<DimsByUrl> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const byPath = new Map<string, string>();
  for (const url of urls) {
    if (!url) continue;
    const path = mediaPathFromUrl(url, supabaseUrl);
    if (path) byPath.set(path, url);
  }
  if (byPath.size === 0) return {};
  try {
    const { data } = await serviceClient().from("image_dimensions").select("path, width, height").in("path", [...byPath.keys()]);
    const out: DimsByUrl = {};
    for (const row of data ?? []) {
      const url = byPath.get(row.path as string);
      if (url) out[url] = { width: row.width as number, height: row.height as number };
    }
    return out;
  } catch {
    return {};
  }
}

/** The `<img src="…">` URLs in a piece of sanitised rich text. */
export function richTextImageUrls(html: string | null | undefined): string[] {
  return [...(html ?? "").matchAll(/<img\s+src="([^"]*)"/gi)].map((m) => m[1]);
}
