/**
 * A per-instance memo with a time-to-live (D259). 500 phones polling once a second share one
 * database read per second per server instance instead of making 500. It lives in module
 * memory, so on Vercel each instance has its own — which is the point: it bounds load, it is
 * not a cache anyone must invalidate across machines. Callers arriving together share the one
 * in-flight load; a failed load is dropped so the next caller retries.
 */
export function createMemo<T>(ttlMs: number, clock: () => number = Date.now) {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const now = clock();
      const hit = entries.get(key);
      if (hit && now - hit.at < ttlMs) return hit.value;
      const value = load();
      entries.set(key, { at: now, value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      // Bound the map: a long-lived instance must not keep every run it ever saw.
      if (entries.size > 1000) {
        for (const [k, e] of entries) if (now - e.at >= ttlMs) entries.delete(k);
      }
      return value;
    },
    clear(key?: string) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
    },
  };
}
