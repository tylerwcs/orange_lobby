import { timingSafeEqual } from "node:crypto";
import { toE164My } from "@/lib/phone";
import type { ActivityChangeRequest } from "@/lib/types";

/** How long a change request may wait undecided before the committee hears about it. */
export const REMINDER_AFTER_MS = 60 * 60 * 1000;

export function dueCutoff(now: Date): string {
  return new Date(now.getTime() - REMINDER_AFTER_MS).toISOString();
}

export function groupByEvent(requests: Pick<ActivityChangeRequest, "id" | "event_id">[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of requests) out.set(r.event_id, [...(out.get(r.event_id) ?? []), r.id]);
  return out;
}

export function pendingPhrase(n: number): string {
  return `${n} booking change request${n === 1 ? "" : "s"}`;
}

/** The Settings textarea: one number per line. Every unreadable line is named, not dropped. */
export function parseAlertNumbers(text: string): { numbers: string[]; bad: string[] } {
  const numbers: string[] = [];
  const bad: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const n = toE164My(line);
    if (!n) bad.push(line);
    else if (!numbers.includes(n)) numbers.push(n);
  }
  return { numbers, bad };
}

/** The cron route's gate. No configured secret means nobody gets in, not everybody. */
export function cronAuthorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
