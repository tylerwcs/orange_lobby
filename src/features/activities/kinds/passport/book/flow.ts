import { unseenReveals, type Passport, type Reveal } from "../../../lib/booths";

/**
 * Where the guest is in their passport (D871–D875):
 * - `locked`: the passport is closed for stamping, so the test can't start (or it shut mid-test);
 * - `closed`: the closed portrait cover, waiting for a tap;
 * - `intro`: the spread before question 1 - the characters to be, a line, Start;
 * - `questions`: one page per question, `index` the one showing;
 * - `name`: "This passport belongs to";
 * - `revealing`: the holder page filling itself in;
 * - `done`: the finished passport, stamps on top.
 */
export type BookStage = "locked" | "closed" | "intro" | "questions" | "name" | "revealing" | "done";

export type BookFlow = {
  stage: BookStage;
  /** Whether this passport has a test to take: without one, opening goes straight to `done` (D881). */
  test: boolean;
  index: number;
  /** The answer picked on each question page, null until picked. */
  picks: (string | null)[];
  closedMessage: string | null;
};

export type BookAction =
  | { type: "open" }
  | { type: "start" }
  | { type: "pick"; answerId: string }
  | { type: "back" }
  | { type: "reveal" }
  | { type: "revealed" }
  | { type: "closed" };

export const OPENS_AT_EVENT = "Your passport opens at the event";
export const CLOSED_MID_TEST = "The passport has closed";

/**
 * D882: a guest with a result always opens to the finished passport. Goal 11 (the user's call):
 * an unopened passport's test can't start. Everyone else starts on the closed cover.
 */
export function bookStart(o: { testOn: boolean; questions: number; hasResult: boolean; isOpen: boolean }): BookFlow {
  const test = o.testOn && o.questions > 0 && !o.hasResult;
  const base = { test, index: 0, picks: Array<string | null>(test ? o.questions : 0).fill(null), closedMessage: null };
  if (o.hasResult) return { ...base, stage: "done" };
  if (test && !o.isOpen) return { ...base, stage: "locked", closedMessage: OPENS_AT_EVENT };
  return { ...base, stage: "closed" };
}

export function bookStep(f: BookFlow, a: BookAction): BookFlow {
  switch (a.type) {
    case "open":
      if (f.stage !== "closed") return f;
      return { ...f, stage: f.test ? "intro" : "done", index: 0 };
    case "start":
      return f.stage === "intro" ? { ...f, stage: "questions", index: 0 } : f;
    case "pick": {
      if (f.stage !== "questions") return f;
      const picks = f.picks.map((p, i) => (i === f.index ? a.answerId : p));
      const last = f.index >= picks.length - 1;
      return { ...f, picks, stage: last ? "name" : "questions", index: last ? f.index : f.index + 1 };
    }
    case "back":
      // D872: the top page flips back one question, the first one back to the intro; the cover
      // never closes again.
      if (f.stage === "name") return { ...f, stage: "questions", index: f.picks.length - 1 };
      if (f.stage === "questions") return f.index > 0 ? { ...f, index: f.index - 1 } : { ...f, stage: "intro" };
      return f;
    case "reveal":
      return f.stage === "name" ? { ...f, stage: "revealing" } : f;
    case "revealed":
      return f.stage === "name" || f.stage === "revealing" ? { ...f, stage: "done" } : f;
    case "closed":
      return f.stage === "intro" || f.stage === "questions" || f.stage === "name" ? { ...f, stage: "locked", closedMessage: CLOSED_MID_TEST } : f;
  }
}

/**
 * D880: stamps a booth gave before the guest finished the test wait. They play right after the
 * reveal (`afterTest`), each in turn, instead of on top of the test pages. Without a test they
 * wait for the cover to open, rather than playing over the closed passport. A draft preview plays
 * nothing on load (D847).
 */
export function heldReveals(p: Passport, o: { testOn: boolean; hasResult: boolean; preview: boolean }): { now: Reveal[]; afterTest: Reveal[] } {
  if (o.preview) return { now: [], afterTest: [] };
  const unseen = unseenReveals(p);
  // Only a guest whose passport opens straight to its finished pages sees them at once; anyone
  // else meets the closed cover first (and the test, if any), so they wait until it is open.
  return o.testOn && o.hasResult ? { now: unseen, afterTest: [] } : { now: [], afterTest: unseen };
}
