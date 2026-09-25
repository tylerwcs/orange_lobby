/**
 * Whether one attendee row matches the admin table's search box.
 *
 * The box searches every column the table can show — name, email, category, source, each
 * field the event defines and each breakout room — not just name and email. That runs here,
 * over values already loaded, rather than as a PostgREST filter: the fields live in `extra`,
 * one `or(...)` term per field would grow with the event, and the rooms are not on the
 * attendee row at all. The page loads the whole roster anyway (capped by `listAttendees`).
 *
 * Every word in the query has to appear somewhere in the row, in any column and any order,
 * so "vip tan" finds a Tan whose category is VIP. Case is ignored.
 */
export function matchesSearch(values: readonly (string | null | undefined)[], q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = values.filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => haystack.includes(w));
}
