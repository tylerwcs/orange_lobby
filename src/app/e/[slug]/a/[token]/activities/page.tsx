import { loadPortalAttendee } from "@/lib/portal";
import { loadActivityEntries } from "@/lib/portal-activity-entries";
import { ActivitiesTab } from "@/components/portal/ActivitiesTab";

export const dynamic = "force-dynamic";

/**
 * The bar's Activities tab: both kinds of activity on one page (D178), as cards sorted into To
 * choose, Booked and Open to you by `ActivitiesTab`. Every card opens the activity's own page,
 * where the booking or the form happens.
 */
export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const { bookings, submissions } = await loadActivityEntries(event, attendee);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold">Activities</h1>
      <ActivitiesTab bookings={bookings} submissions={submissions} basePath={`/e/${slug}/a/${token}`} />
    </div>
  );
}
