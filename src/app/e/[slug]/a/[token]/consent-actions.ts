"use server";
import { refresh } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import { recordConsent, recordTermsAgreed } from "@/lib/db/attendees";
import { portalAsks, TERMS_FIELD } from "@/lib/privacy";

/**
 * The portal's one-time "I agree" (D410). The token is the identity, as everywhere in the
 * portal; refreshing re-runs the layout, which now finds consent and shows the page the
 * attendee opened, at the address they opened it on.
 *
 * D545: when the gate also asks for the event's terms, nothing is recorded without their tick.
 * The browser's `required` asks first; a hand-made POST without it just meets the gate again.
 */
export async function consentAction(slug: string, token: string, formData: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const asks = portalAsks(event, attendee);
  if (asks.terms && formData.get(TERMS_FIELD) !== "yes") return refresh();
  if (asks.consent) await recordConsent(attendee.id);
  if (asks.terms) await recordTermsAgreed(attendee.id);
  refresh();
}
