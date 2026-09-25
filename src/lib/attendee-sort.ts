/**
 * Sorting the attendee table by any column. Done on the server, over the whole filtered list,
 * before it is cut into pages — sorting only the fifty on screen would make page 2 start over.
 *
 * The sort lives in the URL (`?sort=<column key>&dir=asc|desc`), so reload, Back and a shared
 * link keep it; leaving the page drops it, and the table falls back to its own name order.
 */
export type SortDir = "asc" | "desc";
export type Sort = { key: string; dir: SortDir };

// Numeric so Master No 2 sorts before 10; base sensitivity so case and accents do not split
// "Alice" from "alice". Fixed to English rather than the server's locale, so the order does
// not change with wherever the page happens to render.
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareCells(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * A sorted copy. Blank cells go last in both directions: a descending sort is for seeing the
 * largest values first, not a screen of empties. Ties keep the order they came in, which is
 * the table's name order.
 */
export function sortRows<T>(rows: T[], valueOf: (row: T) => string | null | undefined, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: (valueOf(row) ?? "").trim() }))
    .sort((a, b) => {
      if (!a.value !== !b.value) return a.value ? -1 : 1;
      return (a.value && b.value ? sign * compareCells(a.value, b.value) : 0) || a.index - b.index;
    })
    .map((x) => x.row);
}

/** What the URL asks for, if it names a column this table has. Anything else means no sort. */
export function parseSort(key: string | undefined, dir: string | undefined, known: Set<string>): Sort | null {
  if (!key || !known.has(key)) return null;
  return { key, dir: dir === "desc" ? "desc" : "asc" };
}
