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
