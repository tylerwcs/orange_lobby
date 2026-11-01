"use client";
import { groupSessionsByDay } from "../../lib/session-slots";
import { sessionLabel, type SessionSeats } from "../../lib/activities";
import { meterPercent } from "@/lib/meter";
import { shortDate } from "@/lib/text";
import { AddSessionsDialog } from "./AddSessionsDialog";
import { MapLink } from "../../portal/MapLink";
import { Modal } from "@/components/admin/Modal";
import { RowActions } from "@/components/admin/RowActions";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Progress } from "@/components/ui/progress";

/**
 * An activity's sessions as the Setup tab shows them (D240): one section per day, a compact row
 * per session, in the order `listSessions` gives (day, then start time). A row names its room
 * only when it differs from the day's usual one. Each cell and each day has the admin's usual ⋯
 * menu (RowActions): Edit and Delete for a session, Top up seats and Delete for the whole day
 * (D242, D797).
 */
export function SessionDays({ items, addSessions, topUp, saveSession, deleteSession, deleteDay, defaultDay }: {
  items: SessionSeats[];
  addSessions: (fd: FormData) => Promise<void>;
  topUp: (fd: FormData) => Promise<void>;
  saveSession: (sessionId: string, fd: FormData) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteDay: (day: string) => Promise<void>;
  defaultDay: string | null;
}) {
  const days = groupSessionsByDay(items);
  const existing = items.map((i) => ({ day: i.session.day, starts_at: i.session.starts_at }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        {days.length > 0 && (
          <Modal title="Top up seats" hint="Adds seats to every session still to start. Sessions that have started are left as they are." trigger="Top up seats" icon="plus">
            <TopUpForm topUp={topUp} days={days.map((g) => g.day)} />
          </Modal>
        )}
        <AddSessionsDialog addSessions={addSessions} existing={existing} defaultDay={days.at(-1)?.day ?? defaultDay} />
      </div>
      {days.length === 0 && <p className="pb-2 text-sm text-muted-foreground">No sessions yet. Add some to let attendees book a seat.</p>}
      {days.map((g) => {
        const bookings = g.booked;
        const dayLink = g.items.find((i) => i.session.location === g.location && i.session.location_url)?.session.location_url;
        return (
          <section key={g.day} aria-label={shortDate(g.day)} className="rounded-lg border border-border">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-extrabold">{shortDate(g.day)}</h3>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {g.items.length} session{g.items.length === 1 ? "" : "s"} · {g.booked} of {g.seats} booked{g.location ? ` · ${g.location}` : ""}
              </span>
              <MapLink href={dayLink} place={g.location} size="icon-sm" />
              <div className="ml-auto">
                <RowActions
                  name={`every session on ${shortDate(g.day)}`}
                  dialog={{
                    label: "Top up seats",
                    title: `Top up seats on ${shortDate(g.day)}`,
                    hint: "Adds seats to each of this day's sessions still to start.",
                    form: <TopUpForm topUp={topUp} days={[g.day]} />,
                  }}
                  remove={{
                    action: () => deleteDay(g.day),
                    label: "Delete",
                    message: `All ${g.items.length} of them go${bookings ? `, and their ${bookings} booking${bookings === 1 ? "" : "s"} with them` : ""}.`,
                  }}
                />
              </div>
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
                    <RowActions
                      name={label}
                      edit={{ title: `Edit ${label}`, form: (
                      <form action={saveSession.bind(null, s.id)} className="grid gap-4 p-1">
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Day" name="day" type="date" defaultValue={s.day} />
                          <Field label="Seats" name="capacity" type="number" defaultValue={String(s.capacity)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Starts" name="starts_at" type="time" defaultValue={s.starts_at} />
                          <Field label="Ends (optional)" name="ends_at" type="time" defaultValue={s.ends_at} />
                        </div>
                        <Field label="Location (optional)" name="location" defaultValue={s.location} />
                        <Field label="Map link (optional)" name="location_url" type="url" defaultValue={s.location_url} placeholder="https://maps.app.goo.gl/…" />
                        <SubmitButton>Save</SubmitButton>
                      </form>
                      ) }}
                      remove={{
                        action: () => deleteSession(s.id),
                        message: item.booked ? `Its ${item.booked} booking${item.booked === 1 ? "" : "s"} go with it.` : "Nobody has booked it yet.",
                      }}
                    />
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

/**
 * D797: how many seats to add, and to which day's sessions. One day given (the day's own ⋯ menu)
 * fixes it; the Sessions card's button offers every day or any one of them.
 */
function TopUpForm({ topUp, days }: { topUp: (fd: FormData) => Promise<void>; days: string[] }) {
  return (
    <form action={topUp} className="grid gap-4 p-1">
      <Field label="Seats to add to each session" name="seats" type="number" defaultValue="1"
        description="Added on top of what each session has now: 3 seats plus 2 makes 5." />
      {days.length === 1 ? <input type="hidden" name="day" value={days[0]} /> : (
        <label className="grid gap-1.5">
          <span className="text-sm font-bold">Days</span>
          <select name="day" defaultValue="" className="h-9 w-fit rounded-md border border-input bg-transparent px-3 text-sm shadow-xs">
            <option value="">Every day</option>
            {days.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
          </select>
        </label>
      )}
      <SubmitButton>Add seats</SubmitButton>
    </form>
  );
}
