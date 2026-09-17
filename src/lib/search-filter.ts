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

/**
 * Builds the `or(...)` filter body matching name or email.
 *
 * It used to reach into `extra->>company` as well, from when company was a column on the
 * attendee row. Company is an ordinary field now, and no field gets a privileged spot in
 * the filter: the alternative is an `or(...)` that grows a term per column the event
 * happens to define, over values PostgREST cannot index this way.
 */
export function buildAttendeeSearchFilter(q: string): string {
  const term = clean(q);
  return `name.ilike.%${term}%,email.ilike.%${term}%`;
}

/**
 * Builds the `or(...)` filter body matching the name only.
 *
 * The booth scanner searches with this rather than the wide filter. Dropping email from the
 * RESULT is not enough on that route: the query is an inference channel, and an exhibitor
 * typing a rival's domain would get back the names of everyone from it (D98, D99). The crew
 * scanner keeps the wide search — a door legitimately needs to find someone by the email
 * they registered with.
 */
export function buildNameSearchFilter(q: string): string {
  return `name.ilike.%${clean(q)}%`;
}
