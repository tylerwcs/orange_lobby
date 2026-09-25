import { shortDate } from "@/lib/text";

type Row = { id: string; time: string; location: string | null; booked: number; capacity: number; people: string[] };

/** Who is in which session (D237) — what used to need the export. Grouped by day, in session order. */
export function BookingsByDay({ days }: { days: { day: string; sessions: Row[] }[] }) {
  if (days.length === 0) return <p className="text-sm text-muted-foreground">No sessions yet. Add them on the Setup tab.</p>;
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => (
        <section key={d.day} aria-label={shortDate(d.day)}>
          <h3 className="mb-2 text-sm font-extrabold">{shortDate(d.day)}</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {d.sessions.map((s) => (
              <li key={s.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[8rem_1fr_auto] sm:items-baseline sm:gap-3">
                <span className="text-sm font-bold tabular-nums">{s.time}{s.location ? <span className="block text-xs font-semibold text-muted-foreground">{s.location}</span> : null}</span>
                <span className="text-sm">{s.people.length ? s.people.join(", ") : <span className="text-muted-foreground">Nobody yet</span>}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{s.booked} / {s.capacity}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
