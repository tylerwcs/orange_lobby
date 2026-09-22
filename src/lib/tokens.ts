import { randomBytes } from "node:crypto";

export const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 31 symbols, no 0/1/l/i/o
export const TOKEN_LENGTH = 12;

export function generateToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < TOKEN_LENGTH && i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 248) continue; // reject to avoid modulo bias (248 = 31*8)
    out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  }
  return out.length === TOKEN_LENGTH ? out : generateToken();
}

const TOKEN_RE = new RegExp(`^[${TOKEN_ALPHABET}]{${TOKEN_LENGTH}}$`);
export function isValidToken(s: string): boolean {
  return TOKEN_RE.test(s);
}

/**
 * `n` distinct tokens, for a caller that has to hand them all over at once.
 *
 * The purge reissues every attendee's token in a single statement (D172), so it cannot mint
 * them one at a time and cannot retry a clash halfway through. `attendees.token` is UNIQUE,
 * so two equal tokens in one batch would fail the whole purge on a collision nobody could
 * reproduce — a Set is cheap insurance against a one-in-astronomical event that would be
 * maddening to diagnose.
 *
 * Minting them here rather than in SQL keeps TOKEN_ALPHABET the single source of truth. A
 * second implementation in plpgsql would not learn about a change to this one.
 */
export function freshTokens(n: number): string[] {
  const out = new Set<string>();
  while (out.size < n) out.add(generateToken());
  return [...out];
}
