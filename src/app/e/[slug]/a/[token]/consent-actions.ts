"use server";
import { refresh } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import { recordConsent } from "@/lib/db/attendees";

/**
 * The portal's one-time "I agree" (D410). The token is the identity, as everywhere in the
 * portal; refreshing re-runs the layout, which now finds consent and shows the page the
 * attendee opened, at the address they opened it on.
 */
export async function consentAction(slug: string, token: string) {
  const { attendee } = await loadPortalAttendee(slug, token);
  await recordConsent(attendee.id);
  refresh();
}
