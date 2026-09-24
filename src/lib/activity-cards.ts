import { bookingSection, passportSection, type ActivitySection } from "@/lib/portal-activities";
import { bookingCard, formCard, passportCard, type CardView } from "@/lib/activity-card";
import type { ActivityEntry, PassportEntry, SubmissionEntry } from "@/lib/portal-activity-entries";
import type { Activity } from "@/lib/types";

/** One card, with everything needed to draw it and the section it sits under. */
export type ActivityCardItem = {
  activity: Activity;
  view: CardView;
  href: string;
  /** Required and not yet chosen: ringed in the brand colour so it is the card the eye lands on. */
  emphasis: boolean;
  section: ActivitySection;
};

/**
 * Every activity this attendee can see, as cards in the order they need attention: To choose,
 * Booked, Open to you (bookings, then forms, then passports still collecting), Done.
 *
 * The Activities page groups this list under its section headings; the home page's row
 * (D214) takes the first few. One ordering for both, so the card leading the home row is the
 * one leading the page.
 */
export function activityCards(
  entries: { bookings: ActivityEntry[]; submissions: SubmissionEntry[]; passports: PassportEntry[] },
  basePath: string,
): ActivityCardItem[] {
  const href = (a: Activity) => `${basePath}/activities/${a.id}`;

  const bookings = entries.bookings.flatMap((entry) => {
    const pending = entry.controls.pending !== null;
    const section = bookingSection(entry.state, pending);
    if (!section) return [];
    const activity = entry.state.activity;
    return [{ activity, view: bookingCard({ state: entry.state, pending }), href: href(activity), emphasis: section === "choose", section }];
  });
  const inSection = (s: ActivitySection) => bookings.filter((b) => b.section === s);

  // A closed form still shows to somebody outside its categories, because `canSubmit` reports
  // closed first; only "ineligible" hides one.
  const forms: ActivityCardItem[] = entries.submissions
    .filter((s) => s.state.reason !== "ineligible")
    .map(({ form, state }) => ({ activity: form, view: formCard({ form, state }), href: href(form), emphasis: false, section: "open" }));

  const passports: ActivityCardItem[] = entries.passports.map(({ activity, passport }) => ({
    activity,
    view: passportCard({ passport, open: activity.is_open }),
    href: href(activity),
    emphasis: false,
    section: passportSection(passport),
  }));

  return [
    ...inSection("choose"),
    ...inSection("booked"),
    ...inSection("open"),
    ...forms,
    ...passports.filter((p) => p.section === "open"),
    ...passports.filter((p) => p.section === "done"),
  ];
}
