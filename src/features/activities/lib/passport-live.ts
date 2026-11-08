import type { Reveal } from "./booths";

/**
 * The passport page's live queue (D852), as plain state so it can be tested:
 * - `queue` is what is left to reveal, oldest first;
 * - `holds` are booths whose reveal has landed on this page, drawn stamped until the refreshed
 *   grid says otherwise - in either look (round slots or boxes);
 * - each hold carries the `round` it landed in, so a refresh only lets go of the holds it can
 *   actually answer for. One that lands while the refresh is out keeps its hold through it.
 *
 * Once the refreshed grid is in, the server's word stands: a stamp the booth undid reads "?"
 * again instead of staying drawn over its empty slot.
 */
export type LiveState = {
  queue: Reveal[];
  holds: { boothId: string; round: number }[];
  round: number;
  /** Something landed since the last refresh was asked for. */
  dirty: boolean;
  /** The round the refresh in flight covers, or null when none is out. */
  asked: number | null;
};

export type LiveAction =
  | { type: "arrived"; reveals: Reveal[] }
  | { type: "landed"; reveal: Reveal }
  | { type: "refreshing" }
  | { type: "refreshed" };

export function liveStart(initial: Reveal[]): LiveState {
  return { queue: initial, holds: [], round: 0, dirty: false, asked: null };
}

export function liveStep(s: LiveState, a: LiveAction): LiveState {
  switch (a.type) {
    case "arrived": {
      const fresh = a.reveals.filter((r) => !s.queue.some((q) => q.stampId === r.stampId));
      return fresh.length ? { ...s, queue: [...s.queue, ...fresh] } : s;
    }
    case "landed":
      return {
        ...s,
        queue: s.queue.filter((q) => q.stampId !== a.reveal.stampId),
        holds: [...s.holds.filter((h) => h.boothId !== a.reveal.boothId), { boothId: a.reveal.boothId, round: s.round }],
        dirty: true,
      };
    case "refreshing":
      return { ...s, asked: s.round, round: s.round + 1, dirty: false };
    case "refreshed": {
      const upto = s.asked ?? s.round;
      return { ...s, holds: s.holds.filter((h) => h.round > upto), asked: null, dirty: s.asked === null ? false : s.dirty };
    }
  }
}

export function isLanded(s: LiveState, boothId: string): boolean {
  return s.holds.some((h) => h.boothId === boothId);
}

/** Fetch the grid again once the queue has drained, something landed, and no refresh is out. */
export function wantsRefresh(s: LiveState): boolean {
  return s.queue.length === 0 && s.dirty && s.asked === null;
}
