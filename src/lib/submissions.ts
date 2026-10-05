import { categoryMatches } from "@/lib/agenda";
import { inChallenge } from "@/lib/challenge";
import { lastDays, daysBetween } from "@/lib/time";
import type { Activity, ActivitySubmission, Attendee, RegistrationQuestion, GroupMode } from "@/lib/types";
import { isYes, type GroupProgress } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";

/** How many questions a submission activity's editor offers, mirroring `MAX_QUESTIONS` for registration. */
export const MAX_SUBMISSION_QUESTIONS = 20;

export type SubmitReason = "ok" | "closed" | "ineligible" | "limit" | "today" | "nogroup" | "groupdone";
export type SubmitState = {
  can: boolean;
  reason: SubmitReason;
  used: number;
  /** D390: set only on a scored challenge that has not started - still "closed", as the database says, but the card can say when it opens. */
  startsOn?: string;
};

/** The rows that count (D339): every reader of "who submitted" goes through this. */
export function liveSubmissions<T extends Pick<ActivitySubmission, "status">>(subs: T[]): T[] {
  return subs.filter((s) => s.status === "submitted");
}

/**
 * D369: the two modes where submitting is the GROUP's job (a target, or every member once).
 * `members` is not one of them: each person submits for themselves, and the team is only
 * stamped on the entry. Every "is this a group form" branch asks this, not `!== "off"`.
 */
export function isGroupForm(mode: GroupMode): boolean {
  return mode === "entries" || mode === "everyone";
}

/**
 * D399: whether an attendee may open a file in this entry - the same entries the portal already
 * shows them: their own (revoked too, which the tracker shows faded), those they added for a
 * group member (D392), and, on a group form, their group's live entries (D353).
 */
export function canViewFile(
  submission: Pick<ActivitySubmission, "attendee_id" | "submitted_by" | "group_id" | "status">,
  viewer: { id: string; group_id: string | null },
): boolean {
  if (submission.attendee_id === viewer.id || submission.submitted_by === viewer.id) return true;
  return submission.status === "submitted" && submission.group_id !== null && submission.group_id === viewer.group_id;
}

/**
 * D391: whether this attendee may edit this entry now. Only where the organiser allowed it, only
 * their own (a group form shows every member's entries to every member), only a live one, only
 * on the Malaysian day they sent it, and only while the activity is open and theirs to see. The
 * day rule is what keeps a scored challenge's finished days, and so its podiums, as they were.
 */
export function canEditOwn(
  activity: Pick<Activity, "attendee_edit" | "is_open" | "categories">,
  submission: Pick<ActivitySubmission, "attendee_id" | "status" | "submitted_on" | "submitted_by">,
  attendeeId: string,
  category: string | null,
  today: string,
): boolean {
  return activity.attendee_edit && activity.is_open
    && (submission.attendee_id === attendeeId || submission.submitted_by === attendeeId)
    && submission.status === "submitted" && submission.submitted_on === today
    && categoryMatches(activity.categories, category);
}

/**
 * D392: whether this attendee may submit for the members of their group - a Yes in any of the
 * activity's proxy fields. What the page offers; `submit_answers` re-checks it, group included.
 */
export function isProxy(activity: Pick<Activity, "proxy_fields">, attendee: Pick<Attendee, "extra">): boolean {
  return activity.proxy_fields.some((k) => isYes(fieldValue(attendee, k)));
}

/** D342: the first attendee with two live rows on one day — what makes once-a-day impossible. */
export function perDayCollision(subs: Pick<ActivitySubmission, "attendee_id" | "submitted_on" | "status">[]): { attendeeId: string; day: string } | null {
  const seen = new Set<string>();
  for (const s of liveSubmissions(subs)) {
    const k = `${s.attendee_id}|${s.submitted_on}`;
    if (seen.has(k)) return { attendeeId: s.attendee_id, day: s.submitted_on };
    seen.add(k);
  }
  return null;
}

/**
 * Whether this attendee may submit to this activity right now, and if not, why.
 *
 * Every reason here has a counterpart returned by the `submit_answers` function, deliberately:
 * this decides what the page draws, and the database decides what is allowed (D167). These
 * numbers were true when the page rendered and are stale by definition — the same contract
 * `seatsFor` carries for activities.
 *
 * Order matters. A closed activity is reported as closed even when the attendee is also
 * ineligible and also at their cap, because "the desk shut this" is the useful sentence.
 *
 * A group form (D350) swaps the per-person rules for the group's: `group` is this attendee's
 * group's progress, null when they have no group (D354). Same codes as `submit_answers`.
 */
export function canSubmit(
  activity: Activity,
  mine: ActivitySubmission[],
  category: string | null,
  today: string,
  group: GroupProgress | null = null,
  /** D369: the attendee's current team, for `members` mode. */
  teamId: string | null = null,
): SubmitState {
  const used = mine.length;
  if (!activity.is_open) return { can: false, reason: "closed", used };
  // D373: a scored challenge takes entries only on its own days - the same 'closed' submit_answers gives.
  if (activity.scoring && !inChallenge(activity.scoring, today)) {
    return { can: false, reason: "closed", used, ...(today < activity.scoring.starts_on ? { startsOn: activity.scoring.starts_on } : {}) };
  }
  if (!categoryMatches(activity.categories, category)) return { can: false, reason: "ineligible", used };
  if (activity.group_mode === "members") {
    return teamId ? { can: true, reason: "ok", used } : { can: false, reason: "nogroup", used };
  }
  if (activity.group_mode !== "off") {
    if (!group) return { can: false, reason: "nogroup", used };
    if (activity.group_mode === "entries") {
      return group.done ? { can: false, reason: "groupdone", used } : { can: true, reason: "ok", used };
    }
    return mine.some((s) => s.group_id === group.groupId) ? { can: false, reason: "limit", used } : { can: true, reason: "ok", used };
  }
  if (activity.max_per_attendee !== null && used >= activity.max_per_attendee) return { can: false, reason: "limit", used };
  if (activity.per_day && mine.some((s) => s.submitted_on === today)) return { can: false, reason: "today", used };
  return { can: true, reason: "ok", used };
}

/**
 * The cap in words, for the card an organiser scans rather than the two raw columns behind it
 * (D171's two independent dials, `per_day` and `max_per_attendee`). "Once" is called out
 * specially from "Up to 1" for the same reason `describePlacement` spells out a count instead
 * of leaving it to arithmetic: an activity capped at exactly one submission is a different policy
 * from one merely capped low, and the word should say so.
 */
export function capSummary(activity: Pick<Activity, "per_day" | "max_per_attendee"> & Partial<Pick<Activity, "group_mode" | "group_target">>): string {
  if (activity.group_mode === "members") return "Each member, counted by team";
  if (activity.group_mode === "entries") return `${activity.group_target} ${activity.group_target === 1 ? "entry" : "entries"} per group`;
  if (activity.group_mode === "everyone") return "Every group member";
  const total = activity.max_per_attendee === null ? "" : activity.max_per_attendee === 1 ? "Once" : `Up to ${activity.max_per_attendee}`;
  if (activity.per_day) return total ? `Once a day, ${total.toLowerCase()}` : "Once a day";
  return total || "Unlimited";
}

/**
 * The people this activity still needs an answer from: eligible, and holding nothing.
 *
 * The activities equivalent (`unbookedByActivity`) has no `day` because a booking is a
 * booking whenever it was made. A daily check-in is not: yesterday's answer does not answer
 * for today, so the question is only well-formed once you say which day you mean.
 *
 * `day` null asks "has never submitted", which is the only reading a once-only activity has.
 * A non-null `day` asks "did not submit on that day". Which one to pass is the CALLER's
 * decision — the page knows whether the activity is per_day, and keeping that choice visible
 * there beats hiding it in a branch here where nobody reads it.
 *
 * Order is the caller's, which is `listAttendees` order — already alphabetical, which is
 * what a list somebody reads down wants. Same reasoning as `unbookedIds`.
 */
export function missingFrom(
  activity: Pick<Activity, "id" | "categories">,
  submissions: Pick<ActivitySubmission, "activity_id" | "attendee_id" | "submitted_on">[],
  attendeeIds: string[],
  categoryOf: (attendeeId: string) => string | null,
  day: string | null,
): string[] {
  const answered = new Set(
    submissions
      .filter((s) => s.activity_id === activity.id && (day === null || s.submitted_on === day))
      .map((s) => s.attendee_id),
  );
  return attendeeIds.filter((id) => categoryMatches(activity.categories, categoryOf(id)) && !answered.has(id));
}

export type ParticipationDay = { day: string; submitted: boolean };
export type ParticipationRow = {
  attendeeId: string;
  /** One entry per day of the window, oldest first. */
  days: ParticipationDay[];
  /** How many days OF THE WINDOW they submitted on — never more than the window's length. */
  count: number;
  /** Their most recent submission ever, not merely within the window. Null if they never have. */
  lastDay: string | null;
  /** Whole days from `lastDay` to `today`. Null when they have never submitted. */
  daysSince: number | null;
};

/**
 * Who is drifting: each eligible attendee's last `windowDays` as a strip of marks, with the
 * gap since they last submitted at all.
 *
 * The ordering is the feature, not a detail, which is why it lives here under test rather
 * than in the page's JSX. Two rules, and the second is a deliberate departure from "sort by
 * the longest gap":
 *
 *   1. Among people who HAVE submitted, longest gap first — somebody who answered every day
 *      until Tuesday and then stopped is exactly who this screen exists to surface, and an
 *      alphabetical list would bury them.
 *   2. Everyone who has NEVER submitted goes below all of them, in the order given.
 *      Treating "never" as the largest gap is arithmetically tidy and useless in practice:
 *      on a young activity almost nobody has started, so the drifter this screen is for would
 *      sit under forty rows of people who simply have not begun — and those people are
 *      already the chasing list (`missingFrom`).
 *
 * `count` is bounded by the window; `daysSince` deliberately is not. Somebody whose last
 * submission predates the window has an empty strip AND a large gap, and both facts are
 * true and worth seeing.
 */
export function participation(
  activity: Pick<Activity, "id" | "categories">,
  submissions: Pick<ActivitySubmission, "activity_id" | "attendee_id" | "submitted_on">[],
  attendeeIds: string[],
  categoryOf: (attendeeId: string) => string | null,
  today: string,
  windowDays: number,
): ParticipationRow[] {
  const window = lastDays(today, windowDays);
  const mine = submissions.filter((s) => s.activity_id === activity.id);

  // A Set per attendee, so an activity that allows two submissions in one day still marks that
  // day once — the strip answers "did they take part", not "how many times".
  const byAttendee = new Map<string, Set<string>>();
  for (const s of mine) {
    const seen = byAttendee.get(s.attendee_id) ?? new Set<string>();
    seen.add(s.submitted_on);
    byAttendee.set(s.attendee_id, seen);
  }

  const rows = attendeeIds
    .filter((id) => categoryMatches(activity.categories, categoryOf(id)))
    .map((attendeeId) => {
      const seen = byAttendee.get(attendeeId) ?? new Set<string>();
      const days = window.map((day) => ({ day, submitted: seen.has(day) }));
      const lastDay = [...seen].sort().at(-1) ?? null;
      return {
        attendeeId,
        days,
        count: days.filter((d) => d.submitted).length,
        lastDay,
        daysSince: lastDay === null ? null : daysBetween(lastDay, today),
      };
    });

  // Stable by construction: `rows` is already in `attendeeIds` order, and Array#sort is
  // stable, so people who have never submitted keep that order among themselves.
  return rows.sort((a, b) => {
    if (a.daysSince === null && b.daysSince === null) return 0;
    if (a.daysSince === null) return 1;
    if (b.daysSince === null) return -1;
    return b.daysSince - a.daysSince;
  });
}

/**
 * Which of an activity's questions hold an uploaded file's object path rather than typed text.
 *
 * Pure, and therefore here rather than in the db layer where it first lived: it is a fact
 * about a question list, and the callers that need it (the export, the admin table) are
 * reading, not writing.
 */
export function fileQuestionKeys(questions: RegistrationQuestion[]): string[] {
  return questions.filter((q) => q.type === "file").map((q) => q.key);
}

/** What a submission activity's button says: the organiser's words, or "Submit". */
export function submitLabel(activity: Pick<Activity, "action_label">): string {
  return activity.action_label?.trim() || "Submit";
}

/** Long enough for "Upload my results", short enough to stay one line on a phone's button. */
const MAX_LABEL = 24;

/**
 * The when, where and button wording of a submission activity, read from its admin form.
 * Throws the sentence the organiser reads for a date range that cannot be right. An end date
 * the same as the start is one day, and is stored as no end date at all.
 */
export function readSubmissionDetails(get: (key: string) => string | null): Pick<Activity, "starts_on" | "ends_on" | "venue" | "action_label"> {
  const val = (k: string) => get(k)?.trim() || null;
  const starts_on = val("starts_on");
  let ends_on = val("ends_on");
  if (ends_on && !starts_on) throw new Error("Add a start date, or clear the end date.");
  if (starts_on && ends_on && ends_on < starts_on) throw new Error("The end date is before the start date.");
  if (ends_on === starts_on) ends_on = null;
  const action_label = val("action_label");
  if (action_label && action_label.length > MAX_LABEL) throw new Error(`Keep the button wording to ${MAX_LABEL} characters or fewer.`);
  return { starts_on, ends_on, venue: val("venue"), action_label };
}

/** D350: the Setup tab's "Who submits". Throws the sentence the organiser reads. */
export function readGroupRule(get: (key: string) => string | null): { group_mode: GroupMode; group_target: number | null } {
  const mode = get("group_mode");
  if (mode === "everyone") return { group_mode: "everyone", group_target: null };
  if (mode === "members") return { group_mode: "members", group_target: null };
  if (mode !== "entries") return { group_mode: "off", group_target: null };
  const n = Number.parseInt(get("group_target")?.trim() ?? "", 10);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("Entries per group must be a whole number between 1 and 50.");
  return { group_mode: "entries", group_target: n };
}

/** D356: who submits is fixed once entries exist. The sentence, or null when the save may go ahead. */
export function groupRuleChangeBlocked(
  current: Pick<Activity, "group_mode" | "group_target">,
  next: { group_mode: GroupMode; group_target: number | null },
  liveCount: number,
): string | null {
  if (liveCount === 0) return null;
  if (current.group_mode === next.group_mode && current.group_target === next.group_target) return null;
  return liveCount === 1
    ? "This form has 1 submission. Revoke it before changing who submits."
    : `This form has ${liveCount} submissions. Revoke them before changing who submits.`;
}
