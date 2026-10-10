import "server-only";
import type { Event } from "@/lib/types";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { getEventBySetupToken } from "../db";

export const GONE = "This setup link no longer works. Ask your project contact for a new one.";
const BUSY = "Too many saves at once — wait a moment and try again.";

export type Loaded = { ok: true; ev: Event } | { ok: false; message: string };

/**
 * The token is the only authority (D441): a server action is a public POST, so every call
 * re-checks the link and takes the event from it, never from the caller. A rate-limited call
 * says so, rather than claiming the link is dead.
 */
export async function loadByToken(token: string): Promise<Loaded> {
  if (typeof token !== "string" || !isValidToken(token)) return { ok: false, message: GONE };
  if (!allow(`setup:${token}`, 240, 60_000)) return { ok: false, message: BUSY };
  const ev = await getEventBySetupToken(token);
  return ev ? { ok: true, ev } : { ok: false, message: GONE };
}
