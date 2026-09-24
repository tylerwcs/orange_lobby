import { redirect } from "next/navigation";
import { loadPortalAttendee, portalActivities, isUnpublished } from "@/lib/portal";
import { firstPassport } from "@/lib/booths";
import { eligible } from "@/lib/activities";

export const dynamic = "force-dynamic";

/**
 * The "stamps" tile and every link printed before passports were activities (D191). Goes to
 * the first passport this attendee may collect on, or to the Activities tab when there is none.
 */
export default async function StampsPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const base = `/e/${slug}/a/${token}`;
  const passport = firstPassport((await portalActivities(event.id)).filter((a) => eligible(a, attendee.category)));
  redirect(passport ? `${base}/activities/${passport.id}` : `${base}/activities`);
}
