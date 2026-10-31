// A finished slime run whose submit hasn't had a final answer yet (D794): kept on the device and
// sent again when the page comes back (a locked phone, a dropped connection), cleared on any
// final answer. Storage may be missing or throw (private mode, blocked site data): then the run
// is simply not kept, and nothing here ever throws.
import { parseSubmitBody, type SubmitBody, type SubmitReason } from "./timeline";

export type Pending = { runId: string; body: SubmitBody; tries: number };

const keyOf = (token: string) => `qualifier-pending:${token}`;

export function savePending(store: Storage | null, token: string, p: Pending): void {
  try {
    store?.setItem(keyOf(token), JSON.stringify(p));
  } catch {
    // Not kept: the run is still being submitted from memory.
  }
}

/** The kept run for this attendee, or null (none, no storage, or something unreadable). */
export function loadPending(store: Storage | null, token: string): Pending | null {
  try {
    const raw = store?.getItem(keyOf(token));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { runId, body, tries } = v as Record<string, unknown>;
    const parsed = parseSubmitBody(body);
    if (typeof runId !== "string" || !parsed || parsed.runId !== runId) return null;
    if (typeof tries !== "number" || !Number.isSafeInteger(tries) || tries < 0) return null;
    return { runId, body: parsed, tries };
  } catch {
    return null;
  }
}

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
