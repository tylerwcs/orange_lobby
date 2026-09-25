import { serialiseTablePrefs, tableCookieName, type TablePrefs } from "@/lib/columns";

/**
 * Writes part of the table layout without clobbering the rest. Two things write this cookie:
 * the table (columns, order, widths) and the page-size picker under it. Each holds its own copy
 * of the layout from when the page rendered, so writing a whole object would let one undo what
 * the other just saved — hide a column after picking 200 per page, and the page size went back.
 *
 * The stored cookie is the base when there is one; `fallback` (what the server rendered with)
 * only stands in when nothing is stored yet, so a first change keeps the default hidden columns
 * rather than showing everything.
 *
 * Browser-only: reads and writes `document.cookie`.
 */
export function writeTablePrefs(eventId: string, fallback: TablePrefs, change: Partial<TablePrefs>): void {
  const name = tableCookieName(eventId);
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  let stored: Partial<TablePrefs> | null = null;
  if (raw) {
    try { stored = JSON.parse(decodeURIComponent(raw)) as Partial<TablePrefs>; } catch { stored = null; }
  }
  const next = { ...fallback, ...(stored ?? {}), ...change } as TablePrefs;
  document.cookie = `${name}=${serialiseTablePrefs(next)}; path=/; max-age=31536000; samesite=lax`;
}
