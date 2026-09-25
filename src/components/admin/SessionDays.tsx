"use client";
import { groupSessionsByDay } from "@/lib/session-slots";
import { sessionLabel, type SessionSeats } from "@/lib/activities";
import { meterPercent } from "@/lib/meter";
import { shortDate } from "@/lib/text";
import { AddSessionsDialog } from "@/components/admin/AddSessionsDialog";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Progress } from "@/components/ui/progress";

/**
 * An activity's sessions as the Setup tab shows them (D240): one section per day, a compact row
 * per session, in the order `listSessions` gives (day, then start time). A row names its room
 * only when it differs from the day's usual one. Clicking a row edits it; Delete lives in that
 * dialog, and a whole day goes from its header (D242).
 */
export function SessionDays({ items, addSessions, saveSession, deleteSession, deleteDay, defaultDay }: {
  items: SessionSeats[];
  addSessions: (fd: FormData) => Promise<void>;
  saveSession: (sessionId: string, fd: FormData) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteDay: (day: string) => Promise<void>;
  defaultDay: string | null;
}) {
  const days = groupSessionsByDay(items);
  const existing = items.map((i) => ({ day: i.session.day, starts_at: i.session.starts_at }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AddSessionsDialog addSessions={addSessions} existing={existing} defaultDay={days.at(-1)?.day ?? defaultDay} />
      </div>
      {days.length === 0 && <p className="pb-2 text-sm text-muted-foreground">No sessions yet. Add some to let attendees book a seat.</p>}
      {days.map((g) => {
        const bookings = g.booked;
        return (
          <section key={g.day} aria-label={shortDate(g.day)} className="rounded-lg border border-border">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-extrabold">{shortDate(g.day)}</h3>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {g.items.length} session{g.items.length === 1 ? "" : "s"} · {g.booked} of {g.seats} booked{g.location ? ` · ${g.location}` : ""}
              </span>
              <form action={() => deleteDay(g.day)} className="ml-auto">
                <ConfirmButton
                  message={`Delete all ${g.items.length} sessions on ${shortDate(g.day)}?${bookings ? ` Their ${bookings} booking${bookings === 1 ? "" : "s"} go with them.` : ""}`}
                  className="text-destructive"
                >
                  Delete day
                </ConfirmButton>
              </form>
            </header>
            {/* A wrapping grid of small cells rather than a row each: a day of 15-minute slots
                is sixteen sessions, and sixteen full-width rows is the long scroll this page
                was redesigned to remove. */}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 p-3">
              {g.items.map((item) => {
                const s = item.session;
                const label = sessionLabel(s);
                const time = s.ends_at ? `${s.starts_at}–${s.ends_at}` : s.starts_at;
                const elsewhere = s.location !== g.location;
                return (
                  <li key={s.id} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${item.full ? "border-primary/40 bg-accent" : "border-border"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold tabular-nums">{time}</div>
                      <div className="truncate text-xs font-semibold text-muted-foreground tabular-nums">
                        {item.booked} / {s.capacity}{elsewhere ? ` · ${s.location ?? "No location"}` : ""}
                      </div>
                      <Progress className="mt-1 h-1" value={meterPercent(item.booked, s.capacity)} aria-label={`${item.booked} of ${s.capacity} seats booked`} />
                    </div>
                    <Modal title={`Edit ${label}`} trigger="Edit" variant="ghost">
                      <form action={saveSession.bind(null, s.id)} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Day" name="day" type="date" defaultValue={s.day} />
                          <Field label="Seats" name="capacity" type="number" defaultValue={String(s.capacity)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Starts" name="starts_at" type="time" defaultValue={s.starts_at} />
                          <Field label="Ends (optional)" name="ends_at" type="time" defaultValue={s.ends_at} />
                        </div>
                        <Field label="Location (optional)" name="location" defaultValue={s.location} />
                        <SubmitButton>Save</SubmitButton>
                      </form>
                      <form action={() => deleteSession(s.id)} className="mt-3 border-t border-border pt-3">
                        <ConfirmButton
                          message={`Delete ${label}?${item.booked ? ` Its ${item.booked} booking${item.booked === 1 ? "" : "s"} go with it.` : ""}`}
                          className="text-destructive"
                        >
                          Delete session
                        </ConfirmButton>
                      </form>
                    </Modal>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
