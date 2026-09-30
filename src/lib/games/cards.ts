import type { Prize } from "@/lib/games/config";
import type { PrizeProgress, WinnerRow } from "@/lib/games/draw";
import type { Person } from "@/lib/games/wire";

/**
 * The face on every side of a card round's waiting reel: a question mark, never a name, so the
 * room cannot read a resting reel as a pick. wheelLabel renders it as just "?". The id is fixed,
 * so the waiting reel never remounts or redraws when the pool changes.
 */
export const WAITING_FACE: Person = { id: "waiting", label: "?", initials: "?" };

/** "1 card left", "2 cards left". */
export function cardsLeftLabel(n: number): string {
  return `${n} ${n === 1 ? "card" : "cards"} left`;
}

/** A uniform number in [0, 1) from the platform's cryptographic source. */
export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/**
 * A card round's deck (D317): one card per prize unit still to give, shuffled (Fisher–Yates with
 * `rand`). Each entry is a prize number; card 1 is the first entry. The server deals with
 * secureRandom and stores the result on the run, where only a flipped card is ever read.
 */
export function dealDeck(progress: PrizeProgress[], rand: () => number): number[] {
  const deck = progress.flatMap((p) => Array.from({ length: Math.max(0, p.remaining) }, () => p.prize_no));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export type CardView = { no: number; taken: boolean; prize: string | null; image: string | null; winner: string | null };

/** Cards taken in this run: standing winners with a card, by card number. */
function takenCards(winners: WinnerRow[], runId: string): Map<number, WinnerRow> {
  const taken = new Map<number, WinnerRow>();
  for (const w of winners) if (!w.void && w.run_id === runId && typeof w.card_no === "number") taken.set(w.card_no, w);
  return taken;
}

/**
 * The cards as the LED and the host see them (D317). A card's prize — and its picture — is only
 * here once it has been taken: the deck itself never leaves the server, so nobody can read the
 * grid off the wire (games polish, D323).
 */
export function cardsView(deck: number[], winners: WinnerRow[], runId: string, prizes: Prize[], nameOf: (id: string) => string): CardView[] {
  const taken = takenCards(winners, runId);
  return deck.map((_, i) => {
    const no = i + 1;
    const w = taken.get(no);
    if (!w) return { no, taken: false, prize: null, image: null, winner: null };
    const prize = w.prize_no === null ? null : (prizes[w.prize_no] ?? null);
    return { no, taken: true, prize: prize?.name ?? null, image: prize?.image ?? null, winner: nameOf(w.attendee_id) };
  });
}

export function cardsLeft(deck: number[], winners: WinnerRow[], runId: string): number {
  return Math.max(0, deck.length - takenCards(winners, runId).size);
}
