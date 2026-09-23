import Link from "next/link";
import { bookingSection } from "@/lib/portal-activities";
import { bookingCard, formCard, type CardView } from "@/lib/activity-card";
import type { ActivityEntry, SubmissionEntry } from "@/lib/portal-activity-entries";
import type { Activity } from "@/lib/types";
import { ActivityCover, KindTag, MetaLine, StatusChip } from "./ActivityParts";

const caption = "px-0.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * The Activities tab: every activity this attendee can see, as a card with its picture, sorted
 * by what they need to do about it (`bookingSection`) - To choose, Booked, Open to you. A
 * section with nothing in it is not drawn.
 *
 * Every card goes to the activity's own page, whichever kind it is: that is where the poster is
 * read in full, the sections are, and the booking or the form happens. The card says only
 * enough to decide whether to tap - `bookingCard` and `formCard` decide what.
 *
 * A stacked list, not the reference app's carousel: an event has a handful of activities, and
 * a carousel of two hides one of them for no reason.
 */
export function ActivitiesTab({ bookings, submissions, basePath }: {
  bookings: ActivityEntry[];
  submissions: SubmissionEntry[];
  basePath: string;
}) {
  const placed = bookings.map((entry) => ({ entry, section: bookingSection(entry.state, entry.controls.pending !== null) }));
  const pick = (section: string) => placed.filter((p) => p.section === section).map((p) => p.entry);
  const choose = pick("choose");
  const booked = pick("booked");
  const openBookings = pick("open");
  // A closed form still shows to somebody outside its categories, because `canSubmit` reports
  // closed first; only "ineligible" hides one.
  const forms = submissions.filter((s) => s.state.reason !== "ineligible");

  if (choose.length + booked.length + openBookings.length + forms.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing here for this event yet.</p>;
  }

  const bookingItem = (entry: ActivityEntry, emphasis = false) => (
    <ActivityCard
      key={entry.state.activity.id}
      activity={entry.state.activity}
      view={bookingCard({ state: entry.state, pending: entry.controls.pending !== null })}
      href={`${basePath}/activities/${entry.state.activity.id}`}
      emphasis={emphasis}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {choose.length > 0 && <Section title="To choose">{choose.map((e) => bookingItem(e, true))}</Section>}
      {booked.length > 0 && <Section title="Booked">{booked.map((e) => bookingItem(e))}</Section>}
      {openBookings.length + forms.length > 0 && (
        <Section title="Open to you">
          {openBookings.map((e) => bookingItem(e))}
          {forms.map(({ form, state }) => (
            <ActivityCard key={form.id} activity={form} view={formCard({ form, state })} href={`${basePath}/activities/${form.id}`} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={caption}>{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * One activity as a card. The whole card is the link; the pill on the right is what tapping
 * it will do, drawn as a button so it reads as one, but it is not a second target.
 */
function ActivityCard({ activity, view, href, emphasis = false }: {
  activity: Activity;
  view: CardView;
  href: string;
  /** Required and not yet chosen: ringed in the brand colour so it is the card the eye lands on. */
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col overflow-hidden rounded-2xl bg-card outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50 ${emphasis ? "ring-2 ring-primary" : "ring-1 ring-foreground/10"}`}
    >
      <ActivityCover activity={activity} variant="card" />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindTag kind={activity.kind} />
          {view.status && <StatusChip status={view.status} />}
        </div>
        <div className="text-[15px] font-bold leading-snug">{activity.name}</div>
        <div className="mt-auto flex items-center justify-between gap-3">
          {view.meta ? <MetaLine meta={view.meta} /> : <span />}
          <span
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${view.action.primary ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}
          >
            {view.action.label}
          </span>
        </div>
      </div>
    </Link>
  );
}
