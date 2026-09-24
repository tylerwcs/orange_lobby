import Link from "next/link";
import { activityCards, type ActivityCardItem } from "@/lib/activity-cards";
import type { ActivitySection } from "@/lib/portal-activities";
import type { CardView } from "@/lib/activity-card";
import type { ActivityEntry, SubmissionEntry, PassportEntry } from "@/lib/portal-activity-entries";
import type { Activity } from "@/lib/types";
import { ActivityCover, KindTag, MetaLine, StatusChip } from "./ActivityParts";

const caption = "px-0.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

const SECTIONS: { key: ActivitySection; title: string }[] = [
  { key: "choose", title: "To choose" },
  { key: "booked", title: "Booked" },
  { key: "open", title: "Open to you" },
  { key: "done", title: "Done" },
];

/**
 * The Activities tab: every activity this attendee can see, as a card with its picture, sorted
 * by what they need to do about it - To choose, Booked, Open to you, Done. A section with
 * nothing in it is not drawn. The order is `activityCards`', shared with the home page's row.
 *
 * Every card goes to the activity's own page, whichever kind it is: that is where the poster is
 * read in full, the sections are, and the booking, the form, or the stamp grid is. The card says
 * only enough to decide whether to tap - `bookingCard`, `formCard` and `passportCard` decide what.
 *
 * A stacked list here; the home page is where they run as a swipeable row (D214).
 */
export function ActivitiesTab({ bookings, submissions, passports, basePath }: {
  bookings: ActivityEntry[];
  submissions: SubmissionEntry[];
  passports: PassportEntry[];
  basePath: string;
}) {
  const cards = activityCards({ bookings, submissions, passports }, basePath);
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing here for this event yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map(({ key, title }) => {
        const inSection = cards.filter((c) => c.section === key);
        return inSection.length > 0 && <Section key={key} title={title}>{inSection.map((c) => <ActivityCard key={c.activity.id} {...cardProps(c)} />)}</Section>;
      })}
    </div>
  );
}

/** The props `ActivityCard` takes, from one ordered card. */
export const cardProps = ({ activity, view, href, emphasis }: ActivityCardItem) => ({ activity, view, href, emphasis });

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
export function ActivityCard({ activity, view, href, emphasis = false, className = "" }: {
  activity: Activity;
  view: CardView;
  href: string;
  /** Required and not yet chosen: ringed in the brand colour so it is the card the eye lands on. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col overflow-hidden rounded-2xl bg-card outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50 ${emphasis ? "ring-2 ring-primary" : "ring-1 ring-foreground/10"} ${className}`}
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
