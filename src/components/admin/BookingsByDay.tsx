import { Check, X } from "lucide-react";
import { shortDate } from "@/lib/text";

type Person = { name: string; mark: "arrived" | "no-show" | null };
type Row = { id: string; time: string; location: string | null; booked: number; capacity: number; came: number | null; people: Person[] };

/**
 * Who is in which session (D237) — what used to need the export. Grouped by day, in session order.
 * On a day with a booking door (D324) each name also says whether they came: a tick, a
 * "no-show" once the slot has ended, nothing while it is still to come.
 */
export function BookingsByDay({ days }: { days: { day: string; walkIns: string[]; sessions: Row[] }[] }) {
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
                <span className="text-sm">
                  {s.people.length ? s.people.map((p, i) => (
                    <span key={`${p.name}-${i}`}>
                      {i > 0 && ", "}
                      {p.mark === "arrived" && <><Check aria-hidden="true" className="mr-0.5 inline size-3.5 align-[-2px] text-success-strong" /><span className="sr-only">(arrived) </span></>}
                      {p.mark === "no-show" && <X aria-hidden="true" className="mr-0.5 inline size-3.5 align-[-2px] text-destructive-strong" />}
                      {p.name}
                      {p.mark === "no-show" && <span className="text-destructive-strong"> (no-show)</span>}
                    </span>
                  )) : <span className="text-muted-foreground">Nobody yet</span>}
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {s.booked} / {s.capacity}{s.came !== null ? ` · ${s.came} came` : ""}
                </span>
              </li>
            ))}
          </ul>
          {d.walkIns.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold">Walk-ins:</span> {d.walkIns.join(", ")}</p>
          )}
        </section>
      ))}
    </div>
  );
}
