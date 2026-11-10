import { MAX_HOLDER_NAME, type PassportTest } from "./settings";

/** One answer a guest picked. */
export type TestPick = { questionId: string; answerId: string };

/** A guest's saved result (D882), as the `passport_results` row holds it. */
export type PassportResult = {
  id: string;
  activity_id: string;
  attendee_id: string;
  personality_id: string;
  answers: TestPick[];
  holder_name: string;
  created_at: string;
};

export type SaveResult =
  | { ok: true; personalityId: string; holderName: string }
  | { ok: false; reason: "closed" | "off" | "invalid" | "busy" | "missing" };

/**
 * Null when the picks are one answer per question, in the test's order, each belonging to its
 * own question. Anything else is a client we did not write, and the sentence says why.
 */
export function checkPicks(t: PassportTest, picks: TestPick[]): string | null {
  if (!Array.isArray(picks) || picks.length !== t.questions.length) return "Answer every question once.";
  for (let i = 0; i < t.questions.length; i++) {
    const q = t.questions[i];
    const p = picks[i];
    if (!p || p.questionId !== q.id) return "The answers are out of order.";
    if (!q.answers.some((a) => a.id === p.answerId)) return "An answer doesn't belong to its question.";
  }
  return null;
}

/**
 * D883: the personality the guest's answers point to most often. A tie goes to whichever tied
 * personality they picked most recently. Expects picks `checkPicks` has passed.
 */
export function pickPersonality(t: PassportTest, picks: TestPick[]): string {
  const order = picks.map((p) => t.questions.find((q) => q.id === p.questionId)!.answers.find((a) => a.id === p.answerId)!.personality);
  const counts = new Map<string, number>();
  for (const who of order) counts.set(who, (counts.get(who) ?? 0) + 1);
  const most = Math.max(...counts.values());
  for (let i = order.length - 1; i >= 0; i--) if (counts.get(order[i]) === most) return order[i];
  return order[order.length - 1];
}

/**
 * D874: the name a guest typed for their passport, tidied: spaces collapsed, at most 40
 * characters (counted by code point, so an emoji is never cut in half). Blank is their
 * registered name. It goes on the passport only, never on the attendee.
 */
export function cleanHolderName(typed: string, registered: string): string {
  const tidy = (s: string) => Array.from(s.replace(/\s+/g, " ").trim()).slice(0, MAX_HOLDER_NAME).join("").trim();
  return tidy(typeof typed === "string" ? typed : "") || tidy(registered);
}

/** D882: a second save (a double tap, another tab) gets the stored result back, never a new one. */
export function saveOutcome(existing: PassportResult | null, computed: { personalityId: string; holderName: string }): SaveResult {
  if (existing) return { ok: true, personalityId: existing.personality_id, holderName: existing.holder_name };
  return { ok: true, ...computed };
}
