/**
 * Moves one item to a new index, returning a new array. Shared by the drag handlers
 * and the move up/down buttons so both produce exactly the same result — a drag and a
 * keypress that mean the same thing must not diverge.
 *
 * Out-of-range targets clamp to the ends rather than dropping the item: a drop past
 * the last row means "put it last", not "lose it".
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, moved);
  return next;
}
