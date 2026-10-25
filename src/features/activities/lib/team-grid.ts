import type { Disqualification } from "../db/challenge";

/** D726: the other track's disqualifications and its name, for the committee grid of a track pair. */
export type GridElsewhere = { dq: Disqualification[]; name: string };

/**
 * D726: what the committee grid says about one member's disqualification. On a track pair it
 * counts on both tracks, so one made on the other track is shown too - named, since it can only
 * be undone there. This track's own comes first. `where` is null for this track's own.
 */
export function gridDisqualification(attendeeId: string, own: Disqualification[], elsewhere: GridElsewhere | null): { where: string | null; d: Disqualification } | null {
  const here = own.find((d) => d.attendee_id === attendeeId);
  if (here) return { where: null, d: here };
  const there = elsewhere?.dq.find((d) => d.attendee_id === attendeeId);
  return there ? { where: elsewhere!.name, d: there } : null;
}
