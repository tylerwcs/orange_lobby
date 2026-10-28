import { bookingSection, passportSection, type ActivitySection } from "./lib/portal-activities";
import { bookingCard, comingSoonCard, formCard, passportCard, polaroidCard, tournamentCard, type CardView } from "./lib/activity-card";
import { hasResult, isLocked, squadMembers, tournamentOverall } from "@/features/tournaments/client";
import { allCheckedIn } from "./lib/booking-door";
import type { ActivityEntries, EntryMap } from "./lib/portal-activity-entries";
import type { Activity, ActivityKind } from "@/lib/types";
import { ACTIVITY_KINDS } from "./kinds/meta";
import type { Lang } from "@/features/language/lang";

/** The Activities tab's headings: the organiser's pins (D387), then where each card sits for the attendee; Coming soon is D605's. */
export type CardSection = "pinned" | "coming" | ActivitySection;

/** One card, with everything needed to draw it and the section it sits under. */
export type ActivityCardItem = {
  activity: Activity;
  view: CardView;
  /** The activity's page; null on a Coming soon card, which is not a link (D604). */
  href: string | null;
  /** Required and not yet chosen: ringed in the brand colour so it is the card the eye lands on. */
  emphasis: boolean;
  section: CardSection;
  /** D724: the other track of a pair is not pinned for this attendee, though the organiser pinned it. Absent is the organiser's pin. */
  unpinned?: boolean;
};

const SECTION_ORDER: readonly Exclude<CardSection, "pinned">[] = ["choose", "booked", "open", "coming", "done"];

/**
 * Every activity this attendee can see, as cards in the order they need attention: To choose,
 * Booked, Open to you (bookings, then forms, then passports still collecting), Coming soon (D605), Done. Pinned
 * ones lift out ahead of all of that (D387), in the organiser's drag order whatever their kind,
 * and keep their ring if they are still owed.
 *
 * The Activities page groups this list under its section headings; the home page's row
 * (D214) takes the first few. One ordering for both, so the card leading the home row is the
 * one leading the page. Each kind builds its own cards (D416); the order is section first,
 * then kind.
 */
export function activityCards(entries: ActivityEntries & { coming?: Activity[] }, basePath: string, lang: Lang = "en"): ActivityCardItem[] {
  const href = (a: Activity) => `${basePath}/activities/${a.id}`;

  /** One card builder per kind (D416): a kind added to ActivityKind does not build until it has one. */
  const cardsFor: { [K in ActivityKind]: (list: ActivityEntries[K]) => ActivityCardItem[] } = {
    booking: (list) => list.flatMap((entry) => {
      const pending = entry.controls.pending !== null;
      const checkedIn = allCheckedIn(entry);
      const section = bookingSection(entry.state, pending, checkedIn);
      if (!section) return [];
      const activity = entry.state.activity;
      return [{ activity, view: bookingCard({ state: entry.state, pending, checkedIn }, lang), href: href(activity), emphasis: section === "choose", section }];
    }),
    // Only "ineligible" hides a form here; a closed one never arrives (D384, `shownToAttendees`).
    submission: (list) => list
      .filter((s) => s.state.reason !== "ineligible")
      .map(({ form, state, track }) => ({
        activity: form, view: formCard({ form, state }, lang), href: href(form), emphasis: false, section: "open" as const,
        // D724: each attendee's own track stays pinned; the other one sits in the list with "Other track".
        unpinned: track?.status === "other",
      })),
    passport: (list) => list.map(({ activity, passport }) => ({
      activity, view: passportCard({ passport, open: activity.is_open }), href: href(activity), emphasis: false, section: passportSection(passport),
    })),
    polaroid: (list) => list.map(({ activity }) => ({
      // Its page is the camera (D482).
      activity, view: polaroidCard(), href: href(activity), emphasis: false, section: "open" as const,
    })),
    // D647: open to look at whatever its state; never ringed, a short squad is the captain's to chase.
    tournament: (list) => list.map(({ activity, sports, rows, attendeeId, groupId, picker, results, groups, bonus }) => {
      const ready = sports.filter((s) => {
        const n = squadMembers(rows, s.id, groupId).length;
        return n >= s.min_size && n <= s.max_size;
      }).length;
      const playing = new Set(rows.filter((r) => r.attendee_id === attendeeId).map((r) => r.sport_id)).size;
      // D663: once any result is in, the card says how the group stands, if attendees may see it.
      const any = results.some((r) => r.matches.some((m) => hasResult(m, r.slots)) || r.pools.some((p) => p.manual_place !== null));
      const table = activity.place_points ?? [];
      const mine = any && table.length && activity.show_overall !== false ? tournamentOverall(results, groups, table, bonus).find((r) => r.groupId === groupId) : undefined;
      const view = tournamentCard({
        role: picker ? "picker" : "member", ready, sports: sports.length, playing, locked: isLocked(activity.squads_close_at, new Date()),
        results: { any, overall: mine ? { rank: mine.rank, tied: mine.tied, total: mine.total } : null },
      });
      return { activity, view, href: href(activity), emphasis: false, section: "open" as const };
    }),
  };
  const cardsOf = <K extends ActivityKind>(kind: K) => cardsFor[kind](entries[kind]);

  // D605: scheduled, not yet open - after everything open, before Done. Not a link, never ringed:
  // a required one owes nothing until it opens (D606).
  const coming: ActivityCardItem[] = (entries.coming ?? []).flatMap((activity) =>
    activity.opens_at ? [{ activity, view: comingSoonCard(activity.opens_at, lang), href: null, emphasis: false, section: "coming" as const }] : [],
  );

  // Kinds in ACTIVITY_KINDS order, then a stable sort by section: within a section, bookings,
  // then forms, then passports, as the tab has always listed them.
  const rank = (s: CardSection) => SECTION_ORDER.indexOf(s as Exclude<CardSection, "pinned">);
  const ordered = [...ACTIVITY_KINDS.flatMap((k) => cardsOf(k)), ...coming].sort((a, b) => rank(a.section) - rank(b.section));
  const isPinned = (c: ActivityCardItem) => c.activity.pinned && !c.unpinned;
  const pinned = ordered.filter(isPinned)
    .sort((a, b) => a.activity.sort_order - b.activity.sort_order)
    .map((c) => ({ ...c, section: "pinned" as const }));
  return [...pinned, ...ordered.filter((c) => !isPinned(c))];
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
    polaroid: (list) => {
      const e = list.find((p) => p.activity.id === activityId);
      return e ? { entry: e, activity: e.activity } : null;
    },
    tournament: (list) => {
      const e = list.find((t) => t.activity.id === activityId);
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
