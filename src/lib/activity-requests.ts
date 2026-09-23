import { sessionLabel, type ActivityState, type SeatsForViewer } from "@/lib/activities";
import type { ActivityChangeRequest } from "@/lib/types";

/**
 * What an attendee's Activities card offers, given what they hold and what they have asked
 * for.
 *
 * Kept apart from `activityState` because the two answer different questions: that one is
 * about seats, this one is about permission to change. It also keeps `src/lib/activities.ts`
 * from taking on a third concern — it already holds seat derivation and form reading.
 */
export type PendingSummary = {
  kind: ActivityChangeRequest["kind"];
  /** The session they hold, as `sessionLabel` names it. Null only if it has been deleted under them. */
  fromLabel: string | null;
  /** Where they asked to go; null for a cancel, or if that session has been deleted. */
  toLabel: string | null;
};

export type ActivityControls = {
  /** Sessions offering a Book button. Empty while a request is open, at the cap, or closed. */
  bookable: SeatsForViewer[];
  /**
   * Every session this attendee holds in this activity, each stated once below the sessions
   * rather than inline, and each carrying its own controls.
   *
   * A list, not a single seat: `max_per_attendee` goes up to 10 on the admin form, and a
   * singular `holding` bound both request controls to the first held seat, leaving a second
   * seat with no control anywhere — its row read "You are booked" and nothing offered to
   * change it. `main` gave every held row its own Cancel; this is that, through the request
   * gate (D129 as revised: the freedom is to ask).
   *
   * Not to be confused with `ActivityState.held`, which is a count.
   */
  held: SeatsForViewer[];
  /** Sessions they could ask to move to: not theirs, not full. Empty while a request is open. */
  switchTargets: SeatsForViewer[];
  canRequestCancel: boolean;
  pending: PendingSummary | null;
  /** The most recent decline to report, or null. See D153a. */
  declined: PendingSummary | null;
};

/** This activity's open request, or null. At most one exists — the database enforces it (D146). */
export function pendingFor(
  requests: ActivityChangeRequest[],
  activityId: string,
): ActivityChangeRequest | null {
  return requests.find((r) => r.activity_id === activityId && r.status === "pending") ?? null;
}

/**
 * The latest decline for this activity, which is the only outcome the card has to report.
 *
 * An approval needs no announcement — the attendee is booked on the session they asked for
 * and the card already says so. A decline would otherwise be invisible: the pending block
 * vanishes and the card looks exactly as it did before they asked (D153a).
 *
 * "Latest" means the attendee's most recent request for this activity, whatever its status —
 * not the most recent *declined* one. D153a shows the line only while it is "the latest word
 * on the subject", and anything raised after a decline is a later word: a decline followed by
 * an approval used to print "The desk declined your request to move to Afternoon" directly
 * above "You are booked on Afternoon", which is flatly false. A later withdrawal is the same
 * case and falls out of the same expression.
 */
export function lastDeclinedFor(
  requests: ActivityChangeRequest[],
  activityId: string,
): ActivityChangeRequest | null {
  const latest = requests
    .filter((r) => r.activity_id === activityId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1) ?? null;
  return latest?.status === "declined" ? latest : null;
}

export function activityControls(
  state: ActivityState,
  pending: ActivityChangeRequest | null,
  lastDeclined: ActivityChangeRequest | null = null,
): ActivityControls {
  const labelOf = (id: string | null): string | null => {
    const s = id ? state.sessions.find((x) => x.session.id === id) : undefined;
    return s ? sessionLabel(s.session) : null;
  };
  const summarise = (r: ActivityChangeRequest): PendingSummary =>
    ({ kind: r.kind, fromLabel: labelOf(r.from_session_id), toLabel: labelOf(r.to_session_id) });

  const held = state.sessions.filter((s) => s.mine);

  // While a request is open, nothing that changes a seat is offered (§7.4). Book is
  // withheld too, not only the change controls: on an activity allowing more than one
  // session, taking a second seat while asking to move the first hands the desk a request
  // whose meaning has changed under them. Withdraw is always one tap away.
  if (pending) {
    // An open request is the latest word on the subject, so an older decline is no longer
    // news and saying both at once would be noise.
    return {
      bookable: [],
      held,
      switchTargets: [],
      canRequestCancel: false,
      pending: summarise(pending),
      declined: null,
    };
  }

  return {
    declined: lastDeclined ? summarise(lastDeclined) : null,
    bookable: state.canBookMore ? state.sessions.filter((s) => !s.mine && !s.full) : [],
    held,
    // Asking is not taking a seat, so a closed activity still offers this (D157). A full
    // session is never offered, because the approval would be refused (D144) and the desk
    // would be deciding on something that cannot happen. `!s.mine` excludes EVERY held
    // session, not just the one a given control moves out of: an attendee holding two seats
    // must not be offered a move into a seat they already occupy.
    switchTargets: held.length > 0 ? state.sessions.filter((s) => !s.mine && !s.full) : [],
    // D148: a required activity's cancel never reaches the queue. Applies to every held seat
    // alike — `cancel_booking` would allow dropping one of two on a required activity, but
    // D148's rule is that the portal offers no cancel there at all.
    canRequestCancel: held.length > 0 && !state.activity.required,
    pending: null,
  };
}

/**
 * Open requests per activity id, for the count beside each row of the admin's activity list.
 *
 * An activity with none is absent rather than zero, so the caller writes `counts[id] ?? 0`
 * and a zero never renders as a badge.
 */
export function pendingCountByActivity(requests: ActivityChangeRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of requests) {
    if (r.status !== "pending") continue;
    out[r.activity_id] = (out[r.activity_id] ?? 0) + 1;
  }
  return out;
}
