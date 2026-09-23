import { shortDate } from "@/lib/text";

export type MissingPerson = { id: string; name: string; category: string | null };

/**
 * Who this form still needs an answer from.
 *
 * Deliberately a list and not a control, which is where it parts company with
 * `UnbookedPanel`: that one exists so the desk can place somebody into a session, and
 * placing is something an organiser can legitimately do on an attendee's behalf. Submitting
 * a form is not — the answers are the attendee's own — so there is nothing to offer here
 * beyond the names (D175).
 *
 * The day form is a plain GET so the chosen day lives in the URL: a desk working through
 * the morning can bookmark it, reload it, or send it to a colleague and get the same list.
 */
export function MissingPanel({ people, day, today, basePath }: {
  people: MissingPerson[];
  /** The day being asked about, or null for a form that is not per-day. */
  day: string | null;
  today: string;
  basePath: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {day !== null && (
        <form method="GET" action={basePath} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Day</span>
            <input
              type="date" name="day" defaultValue={day}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm font-bold hover:bg-muted">Show</button>
          {day !== today && (
            <a href={basePath} className="text-sm font-bold text-primary underline-offset-4 hover:underline">Back to today</a>
          )}
        </form>
      )}

      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {day === null
            ? "Everyone who can submit has submitted."
            : `Everyone who can submit did so on ${shortDate(day)}.`}
        </p>
      ) : (
        <>
          {/* Says what the list MEANS rather than implying the date is bounded. A day before
              the form existed will honestly show everybody, and that is worth stating once
              here instead of inventing a rule about which days may be asked about. */}
          <p className="text-sm text-muted-foreground">
            {day === null
              ? `${people.length} ${people.length === 1 ? "person has" : "people have"} not submitted.`
              : `${people.length} ${people.length === 1 ? "person" : "people"} did not submit on ${shortDate(day)}.`}
          </p>
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm">{p.name}</span>
                {p.category && <span className="text-sm text-muted-foreground">{p.category}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
