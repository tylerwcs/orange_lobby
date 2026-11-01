// A finished slime run whose submit hasn't had a final answer yet (D794): kept on the device and
// sent again when the page comes back (a locked phone, a dropped connection), cleared on any
// final answer. Storage may be missing or throw (private mode, blocked site data): then the run
// is simply not kept, and nothing here ever throws.
import { RUN_CAP_MS, SUBMIT_GRACE_MS } from "./rules";
import { parseSubmitBody, type SubmitBody, type SubmitReason } from "./timeline";

/** `savedAt`: Date.now() when the run was first kept (0 for one kept before it was recorded). */
export type Pending = { runId: string; body: SubmitBody; tries: number; savedAt: number };

/** Failed tries after which the player may discard a kept run that can't get through. */
export const DISCARD_AFTER_TRIES = 3;

const keyOf = (token: string) => `qualifier-pending:${token}`;

export function savePending(store: Storage | null, token: string, p: Pending): void {
  try {
    store?.setItem(keyOf(token), JSON.stringify(p));
  } catch {
    // Not kept: the run is still being submitted from memory.
  }
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** The kept run for this attendee, or null (none, no storage, or something unreadable). */
export function loadPending(store: Storage | null, token: string): Pending | null {
  try {
    const raw = store?.getItem(keyOf(token));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { runId, body, tries, savedAt = 0 } = v as Record<string, unknown>;
    const parsed = parseSubmitBody(body);
    if (typeof runId !== "string" || !parsed || parsed.runId !== runId) return null;
    if (!isCount(tries) || !isCount(savedAt)) return null;
    return { runId, body: parsed, tries, savedAt };
  } catch {
    return null;
  }
}

/**
 * A kept run past any submit window: the server takes a run until its start + RUN_CAP_MS +
 * SUBMIT_GRACE_MS, and the run was kept after it started, so a minute past that it could only
 * answer "late". Such a run is dropped on the device instead of blocking Play.
 */
export const expired = (p: Pending, now: number): boolean => now > p.savedAt + RUN_CAP_MS + SUBMIT_GRACE_MS + 60_000;

export function clearPending(store: Storage | null, token: string): void {
  try {
    store?.removeItem(keyOf(token));
  } catch {
    // Nothing to do: a store that can't be written held nothing.
  }
}

/**
 * What to do with the kept run after a submit: a final answer (accepted, already counted, too
 * late, refused, invalid) clears it; "early" (the phone's clock ran ahead of the server's) and a
 * network failure keep it to send again.
 */
export function settle(answer: SubmitReason | "ok" | "network"): "clear" | "retry" {
  return answer === "early" || answer === "network" ? "retry" : "clear";
}
