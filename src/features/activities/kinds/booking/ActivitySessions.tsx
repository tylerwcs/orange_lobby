"use client";

import { useMemo, useState } from "react";
import { sessionLabel, type SeatsForViewer } from "../../lib/activities";
import type { ActivityEntry } from "../../lib/portal-activity-entries";
import type { ActivityControls } from "../../lib/activity-requests";
import { sessionGrid, startDay } from "../../lib/session-grid";
import { shortDate } from "@/lib/text";
import { t, useLang } from "@/features/language/client";
import { ConfirmButton } from "@/components/admin/ConfirmButton";


export type BookingActions = {
  book: (sessionId: string) => Promise<void>;
  requestSwitch: (fromSessionId: string, fd: FormData) => Promise<void>;
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: (requestId: string) => Promise<void>;
};

/** Seats left before a slot is flagged: few enough that it is worth knowing before you tap. */
const FEW = 3;

/**
 * One booking activity's sessions, in the dialog the activity page's "Book your session"
 * button opens: a tab per day, a grid of start times, and a bar that books - or asks to switch
 * to - the time you picked. What the attendee already holds, and the cancel and withdraw
 * controls, stay on the page itself (`ActivityBooking`).
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
export function ActivitySessions({ entry: { state, controls }, actions: { book, requestSwitch } }: {
  entry: Pick<ActivityEntry, "state" | "controls">;
  actions: Pick<BookingActions, "book" | "requestSwitch">;
}) {
  const grid = useMemo(() => sessionGrid(state.sessions), [state.sessions]);
  const lang = useLang();
  const d = t(lang).booking;
  const [day, setDay] = useState(() => startDay(grid.days));
  const [picked, setPicked] = useState<string | null>(null);

  const bookable = new Set(controls.bookable.map((s) => s.session.id));
  const switchable = new Set(controls.switchTargets.map((s) => s.session.id));
  const canPick = (s: SeatsForViewer) => !controls.pending && (bookable.has(s.session.id) || switchable.has(s.session.id));
  // A pick that stopped being pickable - it filled up and the page came back - drops out of
  // the bar rather than offering a button the server will refuse.
  const selected = state.sessions.find((s) => s.session.id === picked && canPick(s)) ?? null;
  const current = grid.days.find((d) => d.day === day) ?? grid.days[0];

  return (
    <div className="flex flex-col gap-3">
      {grid.days.length === 0 && <p className="text-sm text-muted-foreground">{d.noSessions}</p>}

      {grid.days.length > 0 && (
        <div role="tablist" aria-label={d.day} className="flex gap-2 overflow-x-auto pb-0.5">
          {grid.days.map((g) => {
            const [weekday, date, month] = shortDate(g.day, lang).split(" ");
            const on = g.day === current?.day;
            return (
              <button
                key={g.day}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setDay(g.day)}
                className={`flex min-w-16 flex-1 flex-col items-center rounded-[12px] border px-2 py-1.5 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
              >
                <span>{weekday}</span>
                <span className={`text-base font-extrabold leading-tight ${on ? "" : "text-foreground"}`}>{date}</span>
                <span>{month}</span>
                {/* Where your seat is, when it is not on the day in front of you. */}
                <span aria-hidden className={`mt-0.5 size-1.5 rounded-full ${g.mine ? (on ? "bg-primary-foreground" : "bg-success") : "bg-transparent"}`} />
                {g.mine && <span className="sr-only">{d.yourBookingSr}</span>}
              </button>
            );
          })}
        </div>
      )}

      {current?.periods.map(({ period, slots }) => (
        <section key={period} className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{d.periods[period]}</h3>
          <div className="grid grid-cols-4 gap-2">
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
                  aria-label={`${s.session.starts_at}${s.mine ? d.yourBookingSr : s.full ? d.fullSr : d.leftSr(s.left)}`}
                  className={`relative flex min-h-11 flex-col items-center justify-center rounded-[10px] border px-1 py-1.5 tabular-nums outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 ${look}`}
                >
                  <span className="text-sm font-extrabold">{s.session.starts_at}</span>
                  {few && (
                    <span className="absolute -top-2 -right-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-bold text-warning no-underline">
                      {d.fewLeft(s.left)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {selected && <ActionBar seat={selected} showRoom={grid.location === null} controls={controls} book={book} requestSwitch={requestSwitch} />}
    </div>
  );
}

/**
 * The picked time and what to do with it. Book when the attendee has room for another seat;
 * otherwise, holding one already, a request to move it there. Both keep the confirmation the
 * row buttons had.
 */
function ActionBar({ seat, showRoom, controls, book, requestSwitch }: {
  seat: SeatsForViewer;
  showRoom: boolean;
  controls: ActivityControls;
  book: BookingActions["book"];
  requestSwitch: BookingActions["requestSwitch"];
}) {
  const { session } = seat;
  const lang = useLang();
  const d = t(lang).booking;
  const when = `${shortDate(session.day, lang)} · ${session.starts_at}${session.ends_at ? `–${session.ends_at}` : ""}`;
  const detail = [showRoom ? session.location : null, d.seatsLeft(seat.left)]
    .filter(Boolean).join(" · ");
  const isBook = controls.bookable.some((s) => s.session.id === session.id);
  const [from, setFrom] = useState(controls.held[0]?.session.id ?? "");
  const fromSeat = controls.held.find((h) => h.session.id === from);

  return (
    // Docked to the foot of the dialog, which is what scrolls: -bottom-4 and the negative
    // margins cancel the dialog's own padding so the bar sits flush with its edge.
    <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-popover px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">{isBook ? when : d.moveTo(when)}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      {isBook ? (
        <form action={book.bind(null, session.id)}>
          <ConfirmButton
            tone="default"
            triggerVariant="default"
            confirmLabel={d.book}
            message={d.confirmBook(`${when}${session.location ? `, ${session.location}` : ""}`)}
          >
            {d.book}
          </ConfirmButton>
        </form>
      ) : (
        <form action={requestSwitch.bind(null, from)} className="flex items-center gap-2">
          <input type="hidden" name="to" value={session.id} />
          {/* Only when there is a choice: max_per_attendee can let someone hold several
              seats, and the request has to say which one moves. */}
          {controls.held.length > 1 && (
            <>
              <label htmlFor={`from-${session.id}`} className="sr-only">{d.moveWhich}</label>
              <select id={`from-${session.id}`} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                {controls.held.map((h) => <option key={h.session.id} value={h.session.id}>{sessionLabel(h.session, { lang })}</option>)}
              </select>
            </>
          )}
          <ConfirmButton
            tone="default"
            triggerVariant="default"
            confirmLabel={d.sendRequest}
            message={d.confirmMove(fromSeat ? sessionLabel(fromSeat.session, { lang }) : d.yourSessionLower, when)}
          >
            {d.requestSwitch}
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
