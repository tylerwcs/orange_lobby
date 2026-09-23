"use client";

import { useMemo, useState } from "react";
import type { ActivityState, SeatsForViewer } from "@/lib/activities";
import type { ActivityControls } from "@/lib/activity-requests";
import { sessionGrid, startDay } from "@/lib/session-grid";
import { shortDate } from "@/lib/text";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Icon } from "@/components/ui/icon";
import { ActivityBooking } from "./ActivityBooking";

export type ActivityEntry = { state: ActivityState; controls: ActivityControls; pendingId: string | null };

export type BookingActions = {
  book: (sessionId: string) => Promise<void>;
  requestSwitch: (fromSessionId: string, fd: FormData) => Promise<void>;
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: (requestId: string) => Promise<void>;
};

/** Seats left before a slot is flagged: few enough that it is worth knowing before you tap. */
const FEW = 3;

/**
 * One booking activity, as the sheet on the Activities tab shows it: a tab per day, a grid of
 * start times, and a bar that books - or asks to switch to - the time you picked.
 *
 * Time leads because it is what people choose by; `sessionGrid` decides what else each slot
 * has to say. Picking a time only selects it. The bar's button does the work, behind the same
 * confirmation the old per-row Book buttons had.
 *
 * A client component for the selection alone. What is bookable and what is a switch target
 * are still `activityControls`' answers, computed on the server, and the writes are the same
 * server actions - `book_session` remains the only authority on whether a seat is free.
 *
 * Was the body of `ActivityList`, one row per session with its own Book button.
 */
export function ActivitySessions({ entry: { state, controls, pendingId }, actions: { book, requestSwitch, requestCancel, withdraw } }: {
  entry: ActivityEntry;
  actions: BookingActions;
}) {
  const grid = useMemo(() => sessionGrid(state.sessions), [state.sessions]);
  const [day, setDay] = useState(() => startDay(grid.days));
  const [picked, setPicked] = useState<string | null>(null);

  const bookable = new Set(controls.bookable.map((s) => s.session.id));
  const switchable = new Set(controls.switchTargets.map((s) => s.session.id));
  const canPick = (s: SeatsForViewer) => !controls.pending && (bookable.has(s.session.id) || switchable.has(s.session.id));
  // A pick that stopped being pickable - it filled up and the page came back - drops out of
  // the bar rather than offering a button the server will refuse.
  const selected = state.sessions.find((s) => s.session.id === picked && canPick(s)) ?? null;
  const current = grid.days.find((d) => d.day === day) ?? grid.days[0];

  const meta = [grid.location, grid.minutes ? `${grid.minutes} min each` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3">
      {state.activity.description && <p className="text-sm text-muted-foreground">{state.activity.description}</p>}
      {meta && (
        <p className="-mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Icon name="map" size={14} />{meta}
        </p>
      )}
      {state.closed && <p className="text-sm text-muted-foreground">Booking is closed for this activity.</p>}

      <ActivityBooking controls={controls} pendingId={pendingId} requestCancel={requestCancel} withdraw={withdraw} />

      {grid.days.length === 0 && <p className="text-sm text-muted-foreground">No sessions have been added yet.</p>}

      {grid.days.length > 0 && (
        <div role="tablist" aria-label="Day" className="flex gap-2 overflow-x-auto pb-0.5">
          {grid.days.map((d) => {
            const [weekday, date, month] = shortDate(d.day).split(" ");
            const on = d.day === current?.day;
            return (
              <button
                key={d.day}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setDay(d.day)}
                className={`flex min-w-16 flex-1 flex-col items-center rounded-[12px] border px-2 py-1.5 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
              >
                <span>{weekday}</span>
                <span className={`text-base font-extrabold leading-tight ${on ? "" : "text-foreground"}`}>{date}</span>
                <span>{month}</span>
                {/* Where your seat is, when it is not on the day in front of you. */}
                <span aria-hidden className={`mt-0.5 size-1.5 rounded-full ${d.mine ? (on ? "bg-primary-foreground" : "bg-success") : "bg-transparent"}`} />
                {d.mine && <span className="sr-only">, your booking</span>}
              </button>
            );
          })}
        </div>
      )}

      {current?.periods.map(({ period, slots }) => (
        <section key={period} className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{period}</h3>
          <div className={`grid gap-2 ${current.titled ? "grid-cols-2" : "grid-cols-4"}`}>
            {slots.map((s) => {
              const pickable = canPick(s);
              const on = selected?.session.id === s.session.id;
              const few = !s.mine && !s.full && s.left <= FEW && s.left < s.session.capacity;
              const look = s.mine
                ? "border-2 border-success bg-success-soft text-success-strong"
                : on ? "border-primary bg-primary text-primary-foreground"
                : s.full ? "border-dashed border-border bg-muted text-muted-foreground line-through"
                : pickable ? "border-border bg-card text-foreground active:scale-95"
                : "border-border bg-card text-muted-foreground opacity-60";
              return (
                <button
                  key={s.session.id}
                  type="button"
                  disabled={!pickable}
                  aria-pressed={on}
                  onClick={() => setPicked(on ? null : s.session.id)}
                  aria-label={`${s.session.starts_at}${current.titled ? `, ${s.session.title}` : ""}${s.mine ? ", your booking" : s.full ? ", full" : `, ${s.left} left`}`}
                  className={`relative flex min-h-11 flex-col items-center justify-center rounded-[10px] border px-1 py-1.5 tabular-nums outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 ${look}`}
                >
                  <span className="text-sm font-extrabold">{s.session.starts_at}</span>
                  {current.titled && <span className="max-w-full truncate text-[11px] font-semibold">{s.session.title}{s.mine ? " · yours" : ""}</span>}
                  {few && (
                    <span className="absolute -top-2 -right-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-bold text-warning no-underline">
                      {s.left} left
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {selected && <ActionBar seat={selected} titled={!!current?.titled} showRoom={grid.location === null} controls={controls} book={book} requestSwitch={requestSwitch} />}
    </div>
  );
}

/**
 * The picked time and what to do with it. Book when the attendee has room for another seat;
 * otherwise, holding one already, a request to move it there. Both keep the confirmation the
 * row buttons had.
 */
function ActionBar({ seat, titled, showRoom, controls, book, requestSwitch }: {
  seat: SeatsForViewer;
  titled: boolean;
  showRoom: boolean;
  controls: ActivityControls;
  book: BookingActions["book"];
  requestSwitch: BookingActions["requestSwitch"];
}) {
  const { session } = seat;
  const when = `${shortDate(session.day)} · ${session.starts_at}${session.ends_at ? `–${session.ends_at}` : ""}`;
  const name = titled ? `${session.title}, ` : "";
  const detail = [titled ? session.title : null, showRoom ? session.location : null, `${seat.left} seat${seat.left === 1 ? "" : "s"} left`]
    .filter(Boolean).join(" · ");
  const isBook = controls.bookable.some((s) => s.session.id === session.id);
  const [from, setFrom] = useState(controls.held[0]?.session.id ?? "");
  const fromSeat = controls.held.find((h) => h.session.id === from);

  return (
    <div className="sticky bottom-0 -mx-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-popover px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">{isBook ? when : `Move to ${when}`}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      {isBook ? (
        <form action={book.bind(null, session.id)}>
          <ConfirmButton
            tone="default"
            triggerVariant="default"
            confirmLabel="Book"
            message={`Book ${name}${when}${session.location ? `, ${session.location}` : ""}?`}
          >
            Book
          </ConfirmButton>
        </form>
      ) : (
        <form action={requestSwitch.bind(null, from)} className="flex items-center gap-2">
          <input type="hidden" name="to" value={session.id} />
          {/* Only when there is a choice: max_per_attendee can let someone hold several
              seats, and the request has to say which one moves. */}
          {controls.held.length > 1 && (
            <>
              <label htmlFor={`from-${session.id}`} className="sr-only">Move which booking</label>
              <select id={`from-${session.id}`} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                {controls.held.map((h) => <option key={h.session.id} value={h.session.id}>{shortDate(h.session.day)} {h.session.starts_at}</option>)}
              </select>
            </>
          )}
          <ConfirmButton
            tone="default"
            triggerVariant="default"
            confirmLabel="Send request"
            message={`Ask the desk to move you from ${fromSeat ? `${shortDate(fromSeat.session.day)} ${fromSeat.session.starts_at}` : "your session"} to ${name}${when}? Your current seat is held until they agree, so nothing changes yet.`}
          >
            Request switch
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
