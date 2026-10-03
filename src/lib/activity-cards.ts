import { bookingSection, passportSection, type ActivitySection } from "@/lib/portal-activities";
import { bookingCard, formCard, passportCard, type CardView } from "@/lib/activity-card";
import { allCheckedIn } from "@/lib/booking-door";
import type { ActivityEntry, PassportEntry, SubmissionEntry } from "@/lib/portal-activity-entries";
import type { Activity } from "@/lib/types";

/** The Activities tab's headings: the organiser's pins (D387), then where each card sits for the attendee. */
export type CardSection = "pinned" | ActivitySection;

/** One card, with everything needed to draw it and the section it sits under. */
export type ActivityCardItem = {
  activity: Activity;
  view: CardView;
  href: string;
  /** Required and not yet chosen: ringed in the brand colour so it is the card the eye lands on. */
  emphasis: boolean;
  section: CardSection;
};

/**
 * Every activity this attendee can see, as cards in the order they need attention: To choose,
 * Booked, Open to you (bookings, then forms, then passports still collecting), Done. Pinned
 * ones lift out ahead of all of that (D387), in the organiser's drag order whatever their kind,
 * and keep their ring if they are still owed.
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
    const checkedIn = allCheckedIn(entry);
    const section = bookingSection(entry.state, pending, checkedIn);
    if (!section) return [];
    const activity = entry.state.activity;
    return [{ activity, view: bookingCard({ state: entry.state, pending, checkedIn }), href: href(activity), emphasis: section === "choose", section }];
  });
  const inSection = (s: ActivitySection) => bookings.filter((b) => b.section === s);

  // Only "ineligible" hides a form here; a closed one never arrives (D384, `shownToAttendees`).
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

  const ordered: ActivityCardItem[] = [
    ...inSection("choose"),
    ...inSection("booked"),
    ...inSection("open"),
    ...forms,
    ...passports.filter((p) => p.section === "open"),
    ...inSection("done"),
    ...passports.filter((p) => p.section === "done"),
  ];
  const pinned = ordered.filter((c) => c.activity.pinned)
    .sort((a, b) => a.activity.sort_order - b.activity.sort_order)
    .map((c) => ({ ...c, section: "pinned" as const }));
  return [...pinned, ...ordered.filter((c) => !c.activity.pinned)];
}
