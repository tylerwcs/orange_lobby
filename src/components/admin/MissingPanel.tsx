import { shortDate } from "@/lib/text";
import { DayNav } from "@/components/admin/DayNav";

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
 * The day picker is `DayNav`, shared with a scored challenge's Submissions tab (D383).
 */
export function MissingPanel({ people, day, today, basePath, tab }: {
  people: MissingPerson[];
  /** The day being asked about, or null for a form that is not per-day. */
  day: string | null;
  today: string;
  basePath: string;
  /**
   * The page tab this panel sits on. A GET form replaces the whole query string, so without it
   * choosing a day would land back on the default tab (D234).
   */
  tab?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {day !== null && <DayNav day={day} today={today} basePath={basePath} tab={tab} />}

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
