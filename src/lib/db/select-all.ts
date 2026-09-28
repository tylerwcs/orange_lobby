import "server-only";

const PAGE = 1000;

/**
 * Every row of a query that can outgrow one request. PostgREST returns at most 1,000 rows per
 * request on Supabase, and a race or a quiz is one row per player, an event's check-ins one per
 * scan, so reads page rather than silently stopping at the 1,001st row (D289).
 *
 * The query must end on a unique column in its `order`, or pages can overlap and skip.
 */
export async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
