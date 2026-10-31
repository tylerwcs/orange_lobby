/**
 * The promise's value if it settles within `ms`, otherwise `fallback`. The promise isn't
 * cancelled: it keeps running, so whatever it caches is there for the next caller.
 */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
