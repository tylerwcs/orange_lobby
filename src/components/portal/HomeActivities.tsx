import Link from "next/link";
import type { ActivityCardItem } from "@/lib/activity-cards";
import { ActivityCard, cardProps } from "./ActivitiesTab";
import { SwipeRow } from "./SwipeRow";

/** More than this and the row stops being a glance; the Activities page has the rest. */
const HOME_CARDS = 5;

/**
 * The attendee's activities on the phone home (D214): the Activities page's own cards, in its
 * order, one at a time with dots underneath - the same row as the breakout tickets (D220).
 * The card that is owed a pick comes first and wears the ring, so it is on the first screen
 * rather than behind a dot.
 */
export function HomeActivities({ cards, basePath }: { cards: ActivityCardItem[]; basePath: string }) {
  if (cards.length === 0) return null;
  const shown = cards.slice(0, HOME_CARDS);
  return (
    <section aria-labelledby="home-activities" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-0.5">
        <h2 id="home-activities" className="text-base font-extrabold">Activities</h2>
        <Link href={`${basePath}/activities`} className="-my-2 inline-flex min-h-11 items-center text-sm font-bold text-primary">
          See all{cards.length > HOME_CARDS ? ` ${cards.length}` : ""} ›
        </Link>
      </div>
      <SwipeRow label="Your activities">
        {shown.map((c) => <ActivityCard key={c.activity.id} {...cardProps(c)} className="w-full" />)}
      </SwipeRow>
    </section>
  );
}
