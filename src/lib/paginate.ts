/** Slices an already-fetched list. Fine at pilot scale (~100 rows); revisit if lists grow. */
export function paginate<T>(rows: T[], page: number, size: number): { slice: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Number.isFinite(page) ? Math.min(pages, Math.max(1, Math.trunc(page))) : 1;
  return { slice: rows.slice((safe - 1) * size, safe * size), page: safe, pages };
}
