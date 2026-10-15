import { MONTHS } from "@/lib/text";
import type { CommitteeMember } from "../types";

/** D559/D560/D566: every link lasts this long and works once. Two months gives a committee time to get round to it. */
export const LINK_DAYS = 60;
/** LINK_DAYS as the admin reads it. */
export const LINK_LIFETIME = "2 months";
export const MIN_PASSWORD = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One person is one row per event and one login: compare emails only in this form (D555). */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The Add member form. Whitespace inside the name collapses; the email is normalised. */
export function parseMember(nameRaw: string, emailRaw: string): { name: string; email: string } | { error: string } {
  const name = nameRaw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter their name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  const email = normaliseEmail(emailRaw);
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  return { name, email };
}

export function linkExpiry(now: Date): string {
  return new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function linkIsLive(m: Pick<CommitteeMember, "link_token" | "link_expires_at" | "removed_at">, now: Date): boolean {
  if (!m.link_token || !m.link_expires_at || m.removed_at) return false;
  return Date.parse(m.link_expires_at) > now.getTime();
}

/** "22 Oct" for an instant, on the Malaysian calendar. (`shortDate` would add a weekday.) */
function klDay(iso: string): string {
  const d = new Date(Date.parse(iso) + KL_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** D563: the Status column. */
export function memberStatus(m: CommitteeMember, now: Date): string {
  const live = linkIsLive(m, now);
  if (!m.accepted_at) return live ? `Invited · link expires ${klDay(m.link_expires_at!)}` : "Link expired";
  const active = `Active since ${klDay(m.accepted_at)}`;
  return live && m.link_kind === "reset" ? `${active} · reset link until ${klDay(m.link_expires_at!)}` : active;
}

/** A code, not a sentence: it travels in `?error=` like the login page's (see login-errors.ts). */
export function passwordProblem(password: string, confirm: string): "short" | "mismatch" | null {
  if (password.length < MIN_PASSWORD) return "short";
  if (password !== confirm) return "mismatch";
  return null;
}

const JOIN_COPY = {
  short: `Use at least ${MIN_PASSWORD} characters.`,
  mismatch: "The two passwords don't match.",
  wrong: "That isn't the password for this login. Try again, or ask the Ecopia team for a password reset link.",
  rejected: "That password wasn't accepted. Try a longer one.",
  busy: "Too many tries at once. Wait a minute and try again.",
  unavailable: "Couldn't sign you in just now. Try again in a minute.",
} as const;
export const JOIN_ERRORS = Object.keys(JOIN_COPY) as (keyof typeof JOIN_COPY)[];
export type JoinError = keyof typeof JOIN_COPY;

/** Anything that is not one of our codes shows nothing, so a crafted URL cannot put words here. */
export function joinErrorCopy(raw: string | undefined): string | null {
  return raw && Object.hasOwn(JOIN_COPY, raw) ? JOIN_COPY[raw as JoinError] : null;
}
