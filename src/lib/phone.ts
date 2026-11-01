import { AsYouType, getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString, validatePhoneNumberLength, type CountryCode } from "libphonenumber-js";

/**
 * A Malaysian number in the only spelling the WhatsApp Cloud API accepts: country code, no
 * plus, no separators — `60123456789`.
 *
 * Deliberately not a mobile check. `attendee-fields.ts` stores a phone exactly as the sheet
 * wrote it, on the grounds that "+60 12-345 6789" and "012 3456789" are the same number to a
 * human (attendee-fields.ts:127). This turns that into the one spelling Meta accepts, and
 * returns null for anything it cannot be sure of.
 *
 * Null is a result, not a failure: the admin dry run lists those rows by name so the sheet can
 * be fixed before a send. Guessing at a half-legible number is the one outcome worth avoiding,
 * because it puts one attendee's personal link on a stranger's phone.
 */
const MY_E164 = /^60\d{8,10}$/;
/** A Malaysian mobile without the country code: 1, then 8 digits (or 9 on 011). */
const MY_MOBILE = /^1(?:1\d{8}|[02-9]\d{7})$/;
/** E.164: a country code and number, 8 to 15 digits in all. */
const INTERNATIONAL = /^[1-9]\d{7,14}$/;

export const PHONE_FORMAT_ERROR = "Enter a valid mobile number. A Malaysian one looks like 12 345 6789";

/**
 * D675: a phone answer on a form (registration, activity forms). A Malaysian mobile - local
 * (012-345 6789) or with +60 / 60 - is stored in that one local spelling; any other country is
 * accepted with its + and code and stored as `+` and digits. Spaces, dashes, dots and brackets
 * are ignored. Not used for imports or admin edits, which keep numbers as written (see above).
 */
/** D676: could these Malaysian digits (after the 0 or 60) still become a mobile, as `MY_MOBILE` reads it? */
function couldBeMyMobile(n: string): boolean {
  if (n === "") return true;
  if (n[0] !== "1") return false;
  return n.length <= (n.length < 2 || n[1] === "1" ? 10 : 9);
}

/**
 * D676: the error to show while someone is still typing - only for what no more typing can fix
 * (a letter, a landline, too many digits, no 0 / 60 / +). A number that is merely unfinished is
 * left alone here; `checkPhone` judges it once they leave the field or press Register.
 */
export function phoneTypingError(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/[^\d\s\-.()+]/.test(t) || t.indexOf("+", 1) !== -1) return PHONE_FORMAT_ERROR;
  const plus = t.startsWith("+");
  const d = t.replace(/\D/g, "");
  if (d === "" || d === "6") return null;
  if (d.startsWith("60")) return couldBeMyMobile(d.slice(2)) ? null : PHONE_FORMAT_ERROR;
  if (plus) return d[0] !== "0" && d.length <= 15 ? null : PHONE_FORMAT_ERROR;
  if (d.startsWith("0")) return couldBeMyMobile(d.slice(1)) ? null : PHONE_FORMAT_ERROR;
  return PHONE_FORMAT_ERROR;
}

export function checkPhone(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+");
  if (/[^\d\s\-.()+]/.test(trimmed) || trimmed.indexOf("+", 1) !== -1) return { ok: false, error: PHONE_FORMAT_ERROR };
  const digits = trimmed.replace(/\D/g, "");
  // Malaysian: 0-led local, or 60 with or without the +.
  const national = digits.startsWith("60") && (plus || digits.length >= 11) ? digits.slice(2)
    : !plus && digits.startsWith("0") ? digits.slice(1)
    : null;
  if (national !== null) {
    if (!MY_MOBILE.test(national)) return { ok: false, error: PHONE_FORMAT_ERROR };
    const split = national.length - 4; // the last four digits stand apart: 12-345 6789, 11-2345 6789
    return { ok: true, value: `0${national.slice(0, 2)}-${national.slice(2, split)} ${national.slice(split)}` };
  }
  // D800: another country's number has to be a real one for that country, not just enough digits.
  if (plus && INTERNATIONAL.test(digits) && isValidPhoneNumber(`+${digits}`)) return { ok: true, value: `+${digits}` };
  return { ok: false, error: PHONE_FORMAT_ERROR };
}

/**
 * D800: the phone field's country picker. The field shows a country and the number within it;
 * what it posts is `joinPhone`'s one string, which `checkPhone` reads and stores exactly as
 * before - Malaysian as 012-345 6789, anyone else as + and digits - so nothing downstream
 * (exports, WhatsApp sends) sees a difference.
 */
export const DEFAULT_COUNTRY: CountryCode = "MY";
export type { CountryCode };

export function dialCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/** A saved or posted answer as the picker shows it: 012-345 6789 is Malaysia's 12-345 6789. */
export function splitPhone(value: string): { country: CountryCode; national: string } {
  const v = value.trim();
  if (!v) return { country: DEFAULT_COUNTRY, national: "" };
  const parsed = v.startsWith("+") ? parsePhoneNumberFromString(v) : parsePhoneNumberFromString(v, DEFAULT_COUNTRY);
  if (parsed?.country) return { country: parsed.country, national: parsed.nationalNumber };
  // Something the parser cannot place stays in the box as typed, for its owner to fix.
  return { country: DEFAULT_COUNTRY, national: v.startsWith("+") ? v.slice(1) : v };
}

/**
 * The picker's country and number as the one string the form posts: `+<code><digits>`. A
 * leading trunk 0 typed out of habit (012… for Malaysia) is dropped, the way the country's own
 * dialling rules say. Letters and the like are kept, so the check can name them.
 */
export function joinPhone(country: CountryCode, national: string): string {
  const t = national.trim();
  if (!t) return "";
  if (/[^\d\s\-.()]/.test(t)) return `${dialCode(country)} ${t}`;
  const typer = new AsYouType(country);
  typer.input(t);
  return typer.getNumber()?.number ?? `${dialCode(country)}${t.replace(/\D/g, "")}`;
}

/**
 * The number spaced out the country's way, for the box once it is left: 12 345 6789. Written
 * without the trunk 0 (the international form, less its code), since the code is beside it.
 * One the library cannot read back is left exactly as typed.
 */
export function formatNational(country: CountryCode, national: string): string {
  const parsed = parsePhoneNumberFromString(joinPhone(country, national));
  return parsed?.isValid() ? parsed.formatInternational().replace(/^\+\d+\s/, "") : national;
}

/** The error under the picker's field, naming the country it was judged for. */
export function phoneErrorFor(country: CountryCode, countryName: string): string {
  return country === DEFAULT_COUNTRY
    ? "Enter a Malaysian mobile number, like 12 345 6789"
    : `That doesn't look like a ${countryName} number. Check it, or pick another country.`;
}

/**
 * D676, D800: the picker's as-you-type error - only for what no more typing can fix. Malaysia
 * keeps its mobile-only rule (`phoneTypingError`); elsewhere, a letter or too many digits.
 */
export function pickerTypingError(country: CountryCode, national: string): boolean {
  const joined = joinPhone(country, national);
  if (!joined) return false;
  if (country === DEFAULT_COUNTRY) return phoneTypingError(joined) !== null;
  if (/[^\d\s\-.()]/.test(national.trim())) return true;
  return validatePhoneNumberLength(joined) === "TOO_LONG";
}

export function toE164My(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).trim().replace(/\D/g, "");
  if (!digits) return null;
  // Local numbers always carry the trunk 0; anything already on 60 is taken as written. A
  // number that is neither is not Malaysian, and is not ours to reshape.
  const candidate = digits.startsWith("60") ? digits
    : digits.startsWith("0") ? `60${digits.slice(1)}`
    : null;
  if (!candidate) return null;
  return MY_E164.test(candidate) ? candidate : null;
}
