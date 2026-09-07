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
