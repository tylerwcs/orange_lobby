"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { sessionLabel, type SeatsForViewer } from "../../lib/activities";
import { MapLink } from "../../portal/MapLink";
import type { ActivityEntry } from "../../lib/portal-activity-entries";
import type { ActivityControls } from "../../lib/activity-requests";
import { sessionGrid, startDay } from "../../lib/session-grid";
import { shortDate } from "@/lib/text";
import { t, useLang } from "@/features/language/client";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Button } from "@/components/ui/button";
import { HealthConsentField } from "../submission/HealthConsentField";
import { SubmissionFields } from "../submission/SubmissionFields";
import type { BookingAsk } from "../../lib/booking-form";
import { MOMENT_BUTTON, MomentLabel, useMomentButton } from "@/features/success-moments/client";


export type BookingActions = {
  book: (sessionId: string) => Promise<void>;
  /** A request to the committee, or - when `controls.direct` (D837) - the move itself. */
  requestSwitch: (fromSessionId: string, fd: FormData) => Promise<void>;
  /** As `requestSwitch`: a request, or the cancel itself when `controls.direct`. */
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: (requestId: string) => Promise<void>;
  /** D898: step 2 of a booking that asks a form first; a refusal comes back, success redirects. */
  bookWithAnswers?: (sessionId: string, fd: FormData) => Promise<{ error: string; back: boolean } | undefined>;
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
export function ActivitySessions({ entry: { state, controls, askFirst }, actions: { book, requestSwitch, bookWithAnswers } }: {
  entry: Pick<ActivityEntry, "state" | "controls" | "askFirst">;
  actions: Pick<BookingActions, "book" | "requestSwitch" | "bookWithAnswers">;
}) {
  const grid = useMemo(() => sessionGrid(state.sessions, controls.started), [state.sessions, controls.started]);
  const lang = useLang();
  const d = t(lang).booking;
  const [day, setDay] = useState(() => startDay(grid.days));
  const [picked, setPicked] = useState<string | null>(null);
  // D898: 2 is the booking's form, for the time picked. The form stays mounted on 1, so going
  // back for another time keeps what was typed.
  const [step, setStep] = useState<1 | 2>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const times = useRef<HTMLDivElement>(null);
  const formTop = useRef<HTMLElement>(null);
  const ask = askFirst && bookWithAnswers ? askFirst : null;
  // The button pressed is hidden by the switch, and the dialog closes when focus falls out of it,
  // so focus moves to the step now shown, in the same tick, before the browser lets it drop.
  const goTo = (to: 1 | 2) => {
    flushSync(() => setStep(to));
    (to === 2 ? formTop.current : times.current)?.focus({ preventScroll: true });
    top.current?.scrollIntoView({ block: "start" });
  };

  const bookable = new Set(controls.bookable.map((s) => s.session.id));
  const switchable = new Set(controls.switchTargets.map((s) => s.session.id));
  // D842: worked out on the server by Kuala Lumpur time, so the phone's own clock never decides it.
  const started = new Set(controls.started);
  const canPick = (s: SeatsForViewer) => !controls.pending && (bookable.has(s.session.id) || switchable.has(s.session.id));
  // A pick that stopped being pickable - it filled up and the page came back - drops out of
  // the bar rather than offering a button the server will refuse.
  const selected = state.sessions.find((s) => s.session.id === picked && canPick(s)) ?? null;
  const current = grid.days.find((d) => d.day === day) ?? grid.days[0];

  const isBook = selected ? bookable.has(selected.session.id) : false;

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-3">
    <div ref={times} tabIndex={-1} className={step === 2 ? "hidden" : "flex flex-col gap-3 outline-none"}>
      {notice && <p role="alert" className="rounded-[10px] bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">{notice}</p>}
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
              const gone = started.has(s.session.id);
              const few = !s.mine && !s.full && !gone && s.left <= FEW && s.left < s.session.capacity;
              const look = s.mine
                ? "border-2 border-success bg-success-soft text-success-strong"
                : on ? "border-primary bg-primary text-primary-foreground"
                // D842: a time that has passed reads like a full one - struck through, not tappable.
                : s.full || gone ? "border-dashed border-border bg-muted text-muted-foreground line-through"
                : pickable ? "border-border bg-card text-foreground active:scale-95"
                : "border-border bg-card text-muted-foreground opacity-60";
              return (
                <button
                  key={s.session.id}
                  type="button"
                  disabled={!pickable}
                  aria-pressed={on}
                  onClick={() => setPicked(on ? null : s.session.id)}
                  aria-label={`${s.session.starts_at}${s.mine ? d.yourBookingSr : gone ? d.startedSr : s.full ? d.fullSr : d.leftSr(s.left)}`}
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

      {selected && (
        <ActionBar
          seat={selected} showRoom={grid.location === null} showMap={grid.location_url === null} controls={controls} book={book} requestSwitch={requestSwitch}
          onNext={ask ? () => { setNotice(null); goTo(2); } : undefined}
        />
      )}
    </div>
      {ask && bookWithAnswers && (
        <BookingForm
          ask={ask}
          seat={step === 2 && selected && isBook ? selected : null}
          send={bookWithAnswers}
          headerRef={formTop}
          onBack={(why) => { setNotice(why); goTo(1); }}
        />
      )}
    </div>
  );
}

/**
 * D898: step 2 - the booking's form for the time picked, and the button that books both. Hidden,
 * not unmounted, on step 1 (`seat` null), so the answers outlive a trip back for another time.
 * Sent from onSubmit, not as the form's action: an action resets the form when it settles, and a
 * refused booking must keep what was typed.
 */
function BookingForm({ ask, seat, send, headerRef, onBack }: {
  ask: BookingAsk;
  /** Focused when this step is shown (see `goTo`). */
  headerRef: React.RefObject<HTMLElement | null>;
  seat: SeatsForViewer | null;
  send: NonNullable<BookingActions["bookWithAnswers"]>;
  /** Back to the times, with the reason when the seat was refused (null when they chose to). */
  onBack: (why: string | null) => void;
}) {
  const lang = useLang();
  const d = t(lang).booking;
  const router = useRouter();
  const session = seat?.session;
  // The time travels in the posted form, so the answer is always for the time on screen.
  const [error, dispatch, pending] = useActionState(async (_prev: string | null, fd: FormData): Promise<string | null> => {
    const r = await send(String(fd.get(":session")), fd);
    // Success redirects to the page, which remounts this dialog closed.
    if (!r) return null;
    if (!r.back) return r.error;
    // The seat counts on screen are stale: fetch fresh ones for the times.
    router.refresh();
    onBack(r.error);
    return null;
  }, null);
  const when = session ? `${shortDate(session.day, lang)} · ${session.starts_at}${session.ends_at ? `–${session.ends_at}` : ""}` : "";
  const sendButton = useRef<HTMLButtonElement>(null);
  const m = useMomentButton(pending, sendButton);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session) return;
    const fd = new FormData(e.currentTarget);
    fd.set(":session", session.id);
    startTransition(() => dispatch(fd));
  };

  return (
    <form onSubmit={submit} className={session ? "flex flex-col gap-4" : "hidden"}>
      <header ref={headerRef} tabIndex={-1} className="flex flex-col gap-1 outline-none">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{d.stepTwo}</p>
        <p className="text-base font-extrabold">{when}</p>
        <p className="text-sm text-muted-foreground">{d.formIntro}</p>
      </header>
      {ask.descriptionHtml && <div className="rich-text prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: ask.descriptionHtml }} />}
      {ask.needsConsent && <HealthConsentField id={`booking-consent-${ask.id}`} />}
      <SubmissionFields questions={ask.questions} />
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-1 flex flex-col gap-2 border-t border-border bg-popover px-4 py-3">
        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onBack(null)} className="h-11 px-4 font-bold">{d.back}</Button>
          <Button ref={sendButton} type="submit" disabled={pending} aria-busy={pending} className={`${MOMENT_BUTTON} h-11 flex-1 font-bold`} {...m.attrs}>
            <MomentLabel face={m.face} busy={m.busy} working={t(lang).common.working}>{d.sendAndBook}</MomentLabel>
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The picked time and what to do with it. Book when the attendee has room for another seat;
 * otherwise, holding one already, a request to move it there. Both keep the confirmation the
 * row buttons had.
 */
function ActionBar({ seat, showRoom, showMap, controls, book, requestSwitch, onNext }: {
  seat: SeatsForViewer;
  /** D898: the booking asks a form first, so booking is Next to it rather than Book. */
  onNext?: () => void;
  showRoom: boolean;
  /** The sessions' map links differ, so the page's own row has none and this one's goes here (D798). */
  showMap: boolean;
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
  // D837: only seats that may still change can be moved out of; asking, that is every held seat.
  const movable = controls.changeable;
  const [from, setFrom] = useState(movable[0]?.session.id ?? "");
  const fromSeat = movable.find((h) => h.session.id === from);
  const fromLabel = fromSeat ? sessionLabel(fromSeat.session, { lang }) : d.yourSessionLower;

  return (
    // Docked to the foot of the dialog, which is what scrolls: -bottom-4 and the negative
    // margins cancel the dialog's own padding so the bar sits flush with its edge.
    <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-popover px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">{isBook ? when : d.moveTo(when)}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      {showMap && <MapLink href={session.location_url} place={session.location} lang={lang} />}
      {isBook && onNext ? (
        <Button type="button" onClick={onNext} className="font-bold">{d.next}</Button>
      ) : isBook ? (
        <form action={book.bind(null, session.id)}>
          <ConfirmButton
            moment
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
          {movable.length > 1 && (
            <>
              <label htmlFor={`from-${session.id}`} className="sr-only">{d.moveWhich}</label>
              <select id={`from-${session.id}`} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                {movable.map((h) => <option key={h.session.id} value={h.session.id}>{sessionLabel(h.session, { lang })}</option>)}
              </select>
            </>
          )}
          <ConfirmButton
            moment
            tone="default"
            triggerVariant="default"
            confirmLabel={controls.direct ? d.moveNow : d.sendRequest}
            message={controls.direct ? d.confirmMoveNow(fromLabel, when) : d.confirmMove(fromLabel, when)}
          >
            {controls.direct ? d.moveNow : d.requestSwitch}
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
