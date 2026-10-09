import { Armchair, CalendarDays, CalendarPlus, MapPin, Users } from "lucide-react";
import { type ActivityEntry } from "../../lib/portal-activity-entries";
import { dayRange } from "../../lib/activity-card";
import { ActivitySessions } from "./ActivitySessions";
import { ActivityBooking } from "./ActivityBooking";
import { ActivityActionDialog } from "../../portal/ActivityActionDialog";
import { sessionGrid } from "../../lib/session-grid";
import { allCheckedIn } from "../../lib/booking-door";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction } from "../../portal/actions";
import { buttonVariants } from "@/components/ui/button";
import { AddToCalendar } from "@/components/portal/AddToCalendar";
import { RichSections } from "@/components/portal/RichSections";
import { block, note, forGroups, InfoRows } from "../../portal/detail-parts";

export function BookingBody({ entry: { state, controls, pendingId, arrivals }, slug, token }: { entry: ActivityEntry; slug: string; token: string }) {
  const { activity } = state;
  const grid = sessionGrid(state.sessions);
  const left = state.sessions.reduce((n, s) => n + s.left, 0);
  const n = state.sessions.length;
  const holding = state.held > 0;
  // D336: once every held session has an arrival, the session is finished. This gates `canAct`
  // below (so every route to a Change session dialog disappears - the inline link, the
  // standalone button, and the one passed as `change`), the sticky Add to calendar button, and,
  // inside ActivityBooking, that seat's own calendar link and Ask to cancel.
  const done = allCheckedIn({ controls, arrivals });
  // Something to do in the dialog: a seat to book, or - holding one - another to ask to move to.
  // `!done` first: once every held session is checked in there is nothing left to switch.
  const canAct = !done && !state.closed && !controls.pending && (controls.bookable.length > 0 || controls.switchTargets.length > 0);
  const calendarPath = `/e/${slug}/a/${token}/activities/${activity.id}/calendar.ics`;
  // Booked on one session, the thing left to do is put it in the calendar, so that is the big
  // button and Change session becomes a link on the booked line. With several seats one
  // button cannot name them all, so each line keeps its own calendar link as before.
  const single = controls.held.length === 1 ? controls.held[0] : null;
  const dialog = (inline: boolean) => (
    <ActivityActionDialog
      key={`${state.held}:${pendingId ?? ""}`}
      inline={inline}
      label={holding ? "Change session" : "Book your session"}
      title={activity.name}
      description={holding ? "Pick another time. The committee approves the move." : state.mustPick ? "Choose one session. The committee can move you later." : "Pick a time."}
    >
      <ActivitySessions
        entry={{ state, controls }}
        actions={{ book: bookAction.bind(null, slug, token), requestSwitch: requestSwitchAction.bind(null, slug, token) }}
      />
    </ActivityActionDialog>
  );
  return (
    <>
      <InfoRows
        rows={[
          { icon: CalendarDays, text: dayRange(state.sessions.map((s) => s.session.day)) },
          { icon: MapPin, text: [grid.location, grid.minutes ? `${grid.minutes} min each` : null].filter(Boolean).join(" · ") || null },
          { icon: Armchair, text: n ? `${left} seat${left === 1 ? "" : "s"} left across ${n} session${n === 1 ? "" : "s"}` : null },
          { icon: Users, text: forGroups(activity) },
        ]}
      />
      <RichSections html={activity.description} />
      <section className={`${block} flex flex-col gap-3`}>
        <h2 className="text-lg font-extrabold">Your session</h2>
        <ActivityBooking
          controls={controls}
          pendingId={pendingId}
          calendarPath={calendarPath}
          change={single ? (canAct ? dialog(true) : null) : undefined}
          requestCancel={requestCancelAction.bind(null, slug, token)}
          withdraw={withdrawRequestAction.bind(null, slug, token)}
          arrivals={arrivals}
        />
        {!holding && !controls.pending && (
          <p className={note}>
            {n === 0 ? "Sessions will be added soon."
              : state.closed ? "Booking is closed. Speak to the registration desk."
              : left === 0 ? "Every session is full."
              : state.mustPick ? "Everyone needs one session. Tap Book your session to pick yours."
              : "You have not booked a session yet."}
          </p>
        )}
      </section>
      {single ? (
        !done && (
          <div className="sticky bottom-4 z-10 mt-2">
            <AddToCalendar
              href={`${calendarPath}?session=${single.session.id}`}
              align="center"
              className={`${buttonVariants({ size: "lg" })} h-12 w-full gap-2 rounded-full text-base font-bold shadow-lg`}
            >
              <CalendarPlus data-icon="inline-start" />
              Add to calendar
            </AddToCalendar>
          </div>
        )
      ) : canAct && dialog(false)}
    </>
  );
}
