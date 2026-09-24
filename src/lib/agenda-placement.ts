import type { AgendaItem } from "@/lib/types";
import { isBreakout, type AgendaRow } from "@/lib/breakouts";
import { firstLater } from "@/lib/agenda-order";

/**
 * A row's identity in a day's order: the item's id, or `slot:<round>` for a breakout round,
 * whose rooms move as one (D197). Prefixed so a round named like a uuid can never collide.
 */
export function itemKey(i: AgendaItem): string {
  return isBreakout(i) ? `slot:${(i.slot as string).trim()}` : i.id;
}

export function rowKey(row: AgendaRow): string {
  return row.kind === "round" ? `slot:${row.slot}` : row.item.id;
}

/** A row's start time; null for an image row, which is never compared (D197). */
export function rowTime(row: AgendaRow): string | null {
  if (row.kind === "round") return row.starts_at;
  return row.item.kind === "session" ? row.item.starts_at : null;
}

/**
 * The day's order with `key` placed by `time` (D197): every other row keeps its place and
 * `key` goes before the first of them that starts strictly later. `key` may already be in the
 * day (a retimed or moved row: it is lifted out first) or not (a new row). No time - an image -
 * goes to the end, and the organiser drags it where it belongs.
 */
export function placeKey(rows: AgendaRow[], key: string, time: string | null): string[] {
  const others = rows.filter((r) => rowKey(r) !== key);
  const at = time === null ? others.length : firstLater(others, time, rowTime);
  const keys = others.map(rowKey);
  keys.splice(at, 0, key);
  return keys;
}

/** Each item's new `sort_order` for this key order: 10 apart, a round's rooms sharing one. */
export function sortOrdersFor(rows: AgendaRow[], keys: string[]): Map<string, number> {
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));
  const out = new Map<string, number>();
  keys.forEach((k, n) => {
    const row = byKey.get(k);
    if (!row) return;
    for (const item of row.kind === "round" ? row.items : [row.item]) out.set(item.id, (n + 1) * 10);
  });
  return out;
}

/**
 * Whether `proposed` is exactly the day's rows, reordered. A reorder posted from a stale page
 * - a row added or deleted in another tab since - is refused whole rather than half-applied:
 * a partial list would renumber the rows it names over the ones it forgot.
 */
export function isValidOrder(current: string[], proposed: string[]): boolean {
  if (proposed.length !== current.length) return false;
  const want = new Set(current);
  const seen = new Set<string>();
  for (const k of proposed) {
    if (!want.has(k) || seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}
