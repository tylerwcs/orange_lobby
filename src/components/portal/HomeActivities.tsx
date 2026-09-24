import Link from "next/link";
import type { ActivityCardItem } from "@/lib/activity-cards";
import { ActivityCard, cardProps } from "./ActivitiesTab";

/** More than this and the row stops being a glance; the Activities page has the rest. */
const HOME_CARDS = 5;

/**
 * The attendee's activities on the phone home (D214): the Activities page's own cards, in its
 * order, as a row that swipes sideways and runs to the screen edge. The card that is owed a
 * pick comes first and wears the ring, so it is on the first screen rather than behind a dot.
 * One card takes the full width - a lone card in a swipe row looks cut off, not swipeable.
 */
export function HomeActivities({ cards, basePath }: { cards: ActivityCardItem[]; basePath: string }) {
  if (cards.length === 0) return null;
  const shown = cards.slice(0, HOME_CARDS);
  const single = shown.length === 1;
  return (
    <section aria-labelledby="home-activities" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-0.5">
        <h2 id="home-activities" className="text-base font-extrabold">Activities</h2>
        <Link href={`${basePath}/activities`} className="-my-2 inline-flex min-h-11 items-center text-sm font-bold text-primary">
          See all{cards.length > HOME_CARDS ? ` ${cards.length}` : ""} ›
        </Link>
      </div>
      {/* The negative margin and matching padding let the row scroll out through <main>'s
          gutters; py-0.5 keeps the ring of the first card from being clipped. */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-0.5 [scrollbar-width:none]">
        {shown.map((c) => (
          <div key={c.activity.id} className={`flex shrink-0 snap-start ${single ? "w-full" : "w-[260px]"}`}>
            <ActivityCard {...cardProps(c)} className="w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
