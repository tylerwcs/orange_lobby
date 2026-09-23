import { shortDate } from "@/lib/text";
import type { ParticipationRow } from "@/lib/submissions";

export type ParticipationPerson = ParticipationRow & { name: string; category: string | null };

/** "Today", "Yesterday", "3 days ago" — the gap in the words somebody would say it in. */
function sinceLabel(daysSince: number | null): string {
  if (daysSince === null) return "Never";
  if (daysSince === 0) return "Today";
  if (daysSince === 1) return "Yesterday";
  return `${daysSince} days ago`;
}

/**
 * Each person's recent pattern, most adrift first.
 *
 * The strip is a presence mark, not a measurement: a per-day form allows one submission a
 * day, so a cell has no magnitude to shade and two states are the whole vocabulary. That is
 * why it needs no palette of its own — a filled cell is `--primary` and an empty one is
 * `--muted`, both already defined for light and dark, so nothing here has to be re-chosen
 * for a theme.
 *
 * Colour is never the only carrier. Every row states its count and its gap in words beside
 * the strip, and every cell names its own date and state for a screen reader — so the shape
 * is a fast way to see a pattern, not the only way to read one.
 */
export function ParticipationPanel({ people, windowDays, today }: {
  people: ParticipationPerson[];
  windowDays: number;
  today: string;
}) {
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody is eligible for this submission yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        The last {windowDays} days, most recently lapsed first. People who have never submitted are below them.
      </p>

      <ul className="divide-y divide-border">
        {people.map((p) => (
          <li key={p.attendeeId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-[10rem] flex-1">
              <div className="text-sm font-bold">{p.name}</div>
              {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
            </div>

            {/* role="img" with one label: a screen reader should hear the summary, not
                fourteen list items. The per-cell titles remain for a pointer. */}
            <div
              role="img"
              aria-label={`${p.name}: submitted on ${p.count} of the last ${windowDays} days`}
              className="flex gap-0.5"
            >
              {p.days.map((d) => (
                <span
                  key={d.day}
                  title={`${shortDate(d.day)} — ${d.submitted ? "submitted" : "no submission"}`}
                  className={[
                    "h-5 w-2.5 rounded-[3px]",
                    d.submitted ? "bg-primary" : "bg-muted",
                    // Today gets a ring so the strip has a visible "now" edge rather than
                    // ending in an unmarked cell that reads like a gap.
                    d.day === today ? "ring-2 ring-ring/50" : "",
                  ].join(" ")}
                />
              ))}
            </div>

            <div className="w-24 text-sm tabular-nums text-muted-foreground">
              {p.count} of {windowDays}
            </div>
            <div className={`w-28 text-sm ${p.daysSince === null ? "text-muted-foreground" : "font-bold"}`}>
              {sinceLabel(p.daysSince)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
