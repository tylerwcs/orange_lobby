/**
 * Which tab an admin page was left on, kept in a cookie so the server can open the page on it.
 *
 * Almost every admin action ends in a redirect back to its own page, and that redirect shows
 * the page's loading.tsx first — so the page is mounted afresh and a tab chosen in the browser
 * alone was forgotten: add a checkpoint and Settings opened on Event details, save a Day 2
 * session and Agenda opened on Day 1. The server reads this cookie instead and renders the tab
 * that was open, so there is no flash of the wrong one either.
 *
 * Scoped to one page of one event (`settings:<event id>`), and to /admin.
 */
export function tabCookieName(scope: string): string {
  return `admin-tab.${scope}`;
}

/** Browser side: remember the tab now on screen. A day is plenty; it only bridges a save. */
export function rememberTab(scope: string, value: string): void {
  document.cookie = `${tabCookieName(scope)}=${encodeURIComponent(value)}; path=/admin; max-age=86400; samesite=lax`;
}

/** Server side: the remembered tab, if it is still one of `allowed`. */
export function rememberedTab<T extends string>(
  jar: { get(name: string): { value: string } | undefined },
  scope: string,
  allowed: readonly T[],
): T | null {
  const raw = jar.get(tabCookieName(scope))?.value;
  if (!raw) return null;
  const value = decodeURIComponent(raw);
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
