import Link from "next/link";
import type { Activity } from "@/lib/types";
import type { SubmitState } from "@/lib/submissions";
import { bookingSection } from "@/lib/portal-activities";
import { sessionLabel } from "@/lib/activities";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { ActivitySheet } from "./ActivitySheet";
import { ActivitySessions, type ActivityEntry, type BookingActions } from "./ActivitySessions";

export type SubmissionEntry = { form: Activity; state: SubmitState };

const caption = "px-0.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";
const Chevron = () => <Icon name="chevron" size={18} className="-rotate-90 shrink-0 text-muted-foreground" />;

/**
 * The Activities tab: every activity this attendee can see, sorted by what they need to do
 * about it (`bookingSection`) - To choose, Booked, Open to you. A section with nothing in it is
 * not drawn.
 *
 * Each booking activity is a short card that opens `ActivitySessions` in a sheet; the card
 * says only enough to decide whether to tap. A submission activity links to its own page, as it
 * always has, and sits under Open to you: it has no seat to hold, and a form already sent is
 * still somewhere to go back to (D167 lets some take more than one).
 */
export function ActivitiesTab({ bookings, submissions, actions, basePath }: {
  bookings: ActivityEntry[];
  submissions: SubmissionEntry[];
  actions: BookingActions;
  basePath: string;
}) {
  const placed = bookings.map((entry) => ({ entry, section: bookingSection(entry.state, entry.controls.pending !== null) }));
  const choose = placed.filter((p) => p.section === "choose").map((p) => p.entry);
  const booked = placed.filter((p) => p.section === "booked").map((p) => p.entry);
  const openBookings = placed.filter((p) => p.section === "open").map((p) => p.entry);
  // Same rule SubmissionList applied: a closed form still shows to somebody outside its
  // categories, because `canSubmit` reports closed first; only "ineligible" hides one.
  const openForms = submissions.filter((s) => s.state.reason !== "ineligible");

  if (choose.length + booked.length + openBookings.length + openForms.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing here for this event yet.</p>;
  }

  const sheet = (entry: ActivityEntry, face: React.ReactNode, emphasis = false) => (
    <ActivitySheet
      key={entry.state.activity.id}
      face={face}
      title={entry.state.activity.name}
      badge={entry.state.mustPick ? <Badge variant="secondary">Pick one</Badge> : undefined}
      description={entry.state.mustPick ? "Choose one session. The desk can move you later." : undefined}
      emphasis={emphasis}
    >
      <ActivitySessions entry={entry} actions={actions} />
    </ActivitySheet>
  );

  return (
    <div className="flex flex-col gap-5">
      {(choose.length > 0 || booked.length > 0) && (
        <div className="-mt-2 flex flex-wrap gap-2">
          {choose.length > 0 && <Badge variant="secondary">{choose.length} to choose</Badge>}
          {booked.length > 0 && <Badge variant="outline">{booked.length} booked</Badge>}
        </div>
      )}

      {choose.length > 0 && (
        <Section title="To choose">
          {choose.map((entry) => sheet(entry, <ChooseFace entry={entry} />, true))}
        </Section>
      )}

      {booked.length > 0 && (
        <Section title="Booked">
          {booked.map((entry) => sheet(entry, <BookedFace entry={entry} />))}
        </Section>
      )}

      {openBookings.length + openForms.length > 0 && (
        <Section title="Open to you">
          {openBookings.map((entry) => sheet(entry, <OpenFace entry={entry} />))}
          {openForms.map(({ form, state }) => (
            <Link
              key={form.id}
              href={`${basePath}/activities/${form.id}`}
              className="flex items-center gap-3 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-background"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">{form.name}</div>
                {state.used > 0 && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {state.used} submission{state.used === 1 ? "" : "s"} sent
                  </div>
                )}
              </div>
              <span className={`text-sm font-bold ${state.can ? "text-primary" : "text-muted-foreground"}`}>
                {state.can ? "Fill in" : state.reason === "closed" ? "Closed" : "View"}
              </span>
              <Chevron />
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className={caption}>{title}</h2>
      {children}
    </section>
  );
}

const seatsLeft = (entry: ActivityEntry) => entry.state.sessions.reduce((n, s) => n + s.left, 0);

function ChooseFace({ entry }: { entry: ActivityEntry }) {
  const { state } = entry;
  const n = state.sessions.length;
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold">{state.activity.name}</span>
          <Badge variant="secondary">Pick one</Badge>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {state.closed
            ? "Booking closed — see the desk"
            : `Required · ${n} session${n === 1 ? "" : "s"} · ${seatsLeft(entry)} seats left`}
        </div>
      </div>
      <Chevron />
    </div>
  );
}

function BookedFace({ entry: { state, controls } }: { entry: ActivityEntry }) {
  const mine = state.sessions.filter((s) => s.mine);
  // What tapping offers, named: the attendee is asking, not changing (D129 as revised).
  const ask = controls.switchTargets.length > 0 && controls.canRequestCancel
    ? "Ask to switch or cancel"
    : controls.switchTargets.length > 0 ? "Ask to switch"
    : controls.canRequestCancel ? "Ask to cancel" : null;
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold">{state.activity.name}</span>
          {controls.pending
            ? <span className="text-xs font-bold text-muted-foreground">Waiting for the desk</span>
            : <span className="flex items-center gap-1 text-xs font-bold text-success-strong"><Icon name="check" size={14} />Booked</span>}
        </div>
        {mine.map(({ session }) => (
          <div key={session.id} className="mt-0.5 text-xs text-muted-foreground">
            {[sessionLabel(session), session.location].filter(Boolean).join(" · ")}
          </div>
        ))}
        {!controls.pending && ask && <div className="mt-2 text-xs font-bold text-primary">{ask}</div>}
      </div>
    </div>
  );
}

function OpenFace({ entry }: { entry: ActivityEntry }) {
  const { state } = entry;
  const left = seatsLeft(entry);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1 text-[15px] font-bold">{state.activity.name}</div>
      <span className="text-sm text-muted-foreground tabular-nums">
        {state.closed ? "Closed" : left === 0 ? "Full" : `${left} left`}
      </span>
      <Chevron />
    </div>
  );
}
