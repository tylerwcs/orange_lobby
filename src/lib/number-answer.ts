import type { RegistrationQuestion } from "@/lib/types";

type Limits = Pick<RegistrationQuestion, "min" | "max" | "decimals">;
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/** D370: limits are opt-in, so a number question nobody configured keeps its old, loose behaviour. */
export function hasNumberLimits(q: Limits): boolean {
  return q.min !== undefined || q.max !== undefined || q.decimals !== undefined;
}

/**
 * One answer to a number question with limits: a plain decimal (no sign, no exponent, no
 * thousands separator), inside min and max, with no more places than `decimals` once trailing
 * zeros are dropped. The value comes back normalised ("2.50" → "2.5"), which is the string
 * stored (D161 keeps answers as strings).
 *
 * Kept free of zod so the portal's client form can import `numberInputAttrs` from here.
 */
export function checkNumber(q: Pick<RegistrationQuestion, "label"> & Limits, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!PLAIN_DECIMAL.test(v)) return { ok: false, error: `${q.label} must be a number, like 2.5` };
  const n = Number(v);
  const places = (v.split(".")[1] ?? "").replace(/0+$/, "").length;
  if (q.decimals !== undefined && places > q.decimals) {
    return { ok: false, error: q.decimals === 0 ? `${q.label} must be a whole number` : `${q.label} can have at most ${q.decimals} decimal places` };
  }
  if (q.min !== undefined && n < q.min) return { ok: false, error: `${q.label} must be at least ${q.min}` };
  if (q.max !== undefined && n > q.max) return { ok: false, error: `${q.label} must be ${q.max} or less` };
  return { ok: true, value: String(n) };
}

/** What the portal's <input> carries for a limited number question; null leaves it as it always was. */
export function numberInputAttrs(q: Limits): { inputMode: "decimal"; step: string; min?: number; max?: number } | null {
  if (!hasNumberLimits(q)) return null;
  const step = q.decimals === undefined ? "any" : q.decimals === 0 ? "1" : (1 / 10 ** q.decimals).toFixed(q.decimals);
  return {
    inputMode: "decimal",
    step,
    ...(q.min !== undefined ? { min: q.min } : {}),
    ...(q.max !== undefined ? { max: q.max } : {}),
  };
}
