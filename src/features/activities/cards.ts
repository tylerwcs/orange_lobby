import { bookingSection, passportSection, type ActivitySection } from "@/lib/portal-activities";
import { bookingCard, formCard, passportCard, type CardView } from "@/lib/activity-card";
import { allCheckedIn } from "@/lib/booking-door";
import type { ActivityEntries, EntryMap } from "@/lib/portal-activity-entries";
import type { Activity, ActivityKind } from "@/lib/types";
import { ACTIVITY_KINDS } from "./kinds/meta";

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

const SECTION_ORDER: readonly ActivitySection[] = ["choose", "booked", "open", "done"];

/**
 * Every activity this attendee can see, as cards in the order they need attention: To choose,
 * Booked, Open to you (bookings, then forms, then passports still collecting), Done. Pinned
 * ones lift out ahead of all of that (D387), in the organiser's drag order whatever their kind,
 * and keep their ring if they are still owed.
 *
 * The Activities page groups this list under its section headings; the home page's row
 * (D214) takes the first few. One ordering for both, so the card leading the home row is the
 * one leading the page. Each kind builds its own cards (D416); the order is section first,
 * then kind.
 */
export function activityCards(entries: ActivityEntries, basePath: string): ActivityCardItem[] {
  const href = (a: Activity) => `${basePath}/activities/${a.id}`;

  /** One card builder per kind (D416): a kind added to ActivityKind does not build until it has one. */
  const cardsFor: { [K in ActivityKind]: (list: ActivityEntries[K]) => ActivityCardItem[] } = {
    booking: (list) => list.flatMap((entry) => {
      const pending = entry.controls.pending !== null;
      const checkedIn = allCheckedIn(entry);
      const section = bookingSection(entry.state, pending, checkedIn);
      if (!section) return [];
      const activity = entry.state.activity;
      return [{ activity, view: bookingCard({ state: entry.state, pending, checkedIn }), href: href(activity), emphasis: section === "choose", section }];
    }),
    // Only "ineligible" hides a form here; a closed one never arrives (D384, `shownToAttendees`).
    submission: (list) => list
      .filter((s) => s.state.reason !== "ineligible")
      .map(({ form, state }) => ({ activity: form, view: formCard({ form, state }), href: href(form), emphasis: false, section: "open" as const })),
    passport: (list) => list.map(({ activity, passport }) => ({
      activity, view: passportCard({ passport, open: activity.is_open }), href: href(activity), emphasis: false, section: passportSection(passport),
    })),
  };
  const cardsOf = <K extends ActivityKind>(kind: K) => cardsFor[kind](entries[kind]);

  // Kinds in ACTIVITY_KINDS order, then a stable sort by section: within a section, bookings,
  // then forms, then passports, as the tab has always listed them.
  const rank = (s: CardSection) => SECTION_ORDER.indexOf(s as ActivitySection);
  const ordered = ACTIVITY_KINDS.flatMap((k) => cardsOf(k)).sort((a, b) => rank(a.section) - rank(b.section));
  const pinned = ordered.filter((c) => c.activity.pinned)
    .sort((a, b) => a.activity.sort_order - b.activity.sort_order)
    .map((c) => ({ ...c, section: "pinned" as const }));
  return [...pinned, ...ordered.filter((c) => !c.activity.pinned)];
}

/** The entry behind one activity page, with its kind, for an exhaustive switch over what to draw (D416). */
export type FoundEntry = { [K in ActivityKind]: { kind: K; entry: EntryMap[K]; activity: Activity } }[ActivityKind];

export function findEntry(entries: ActivityEntries, activityId: string): FoundEntry | null {
  const finders: { [K in ActivityKind]: (list: ActivityEntries[K]) => { entry: EntryMap[K]; activity: Activity } | null } = {
    // An ineligible booking has no page, as before.
    booking: (list) => {
      const e = list.find((b) => b.state.activity.id === activityId && b.state.eligible);
      return e ? { entry: e, activity: e.state.activity } : null;
    },
    submission: (list) => {
      const e = list.find((s) => s.form.id === activityId);
      return e ? { entry: e, activity: e.form } : null;
    },
    passport: (list) => {
      const e = list.find((p) => p.activity.id === activityId);
      return e ? { entry: e, activity: e.activity } : null;
    },
  };
  const findIn = <K extends ActivityKind>(kind: K) => finders[kind](entries[kind]);
  for (const kind of ACTIVITY_KINDS) {
    const hit = findIn(kind);
    if (hit) return { kind, ...hit } as FoundEntry;
  }
  return null;
}
