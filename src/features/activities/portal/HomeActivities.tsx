import Link from "next/link";
import type { ActivityCardItem } from "../cards";
import { ActivityCard, cardProps } from "./ActivitiesTab";
import { SwipeRow } from "@/components/portal/SwipeRow";
import { t } from "@/features/language/client";
import type { Lang } from "@/features/language/client";

/** More than this and the row stops being a glance; the Activities page has the rest. */
const HOME_CARDS = 5;

/**
 * The attendee's activities on the phone home (D214): the Activities page's own cards, in its
 * order, one at a time with dots underneath - the same row as the breakout tickets (D220).
 * The card that is owed a pick comes first and wears the ring, so it is on the first screen
 * rather than behind a dot.
 *
 * The desktop home has them too (D490), in its centre column since D731: one under another, no
 * swipe. The page renders that copy as well as the phone's, so each takes its own heading id.
 */
export function HomeActivities({ cards, basePath, desktop = false, lang = "en" }: {
  cards: ActivityCardItem[];
  lang?: Lang;
  basePath: string;
  /** The desktop home's copy: a grid rather than the swipe row. */
  desktop?: boolean;
}) {
  if (cards.length === 0) return null;
  const d = t(lang);
  const shown = cards.slice(0, HOME_CARDS).map((c) => <ActivityCard key={c.activity.id} {...cardProps(c)} lang={lang} className="w-full" />);
  const headingId = desktop ? "home-activities-desktop" : "home-activities";
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-0.5">
        <h2 id={headingId} className="text-base font-extrabold">{d.home.activities}</h2>
        <Link href={`${basePath}/activities`} className="-my-2 inline-flex min-h-11 items-center text-sm font-bold text-primary">
          {d.home.seeAll}{cards.length > HOME_CARDS ? ` ${cards.length}` : ""} ›
        </Link>
      </div>
      {desktop ? (
        <ul aria-label={d.home.yourActivities} className="grid gap-4">
          {shown.map((card) => <li key={card.key} className="flex">{card}</li>)}
        </ul>
      ) : (
        <SwipeRow label={d.home.yourActivities}>{shown}</SwipeRow>
      )}
    </section>
  );
}
