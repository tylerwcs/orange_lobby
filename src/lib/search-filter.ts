/**
 * PostgREST `or=` filters are a comma-separated, parenthesised mini-language, and
 * `ilike` treats `%` as a wildcard. A raw search term can therefore inject extra
 * conditions or match everything, so strip the separators before interpolating.
 */
const UNSAFE = /[%,()\\"]/g;

function clean(q: string): string {
  return q.trim().replace(UNSAFE, "");
}

/** True when the term still has something to match on after cleaning. */
export function isSearchable(q: string): boolean {
  return clean(q).length >= 1;
}

/** Builds the `or(...)` filter body matching name, email or company. */
export function buildAttendeeSearchFilter(q: string): string {
  const term = clean(q);
  return `name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`;
}
