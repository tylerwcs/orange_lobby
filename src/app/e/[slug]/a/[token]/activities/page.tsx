import { loadPortalAttendee } from "@/lib/portal";
import { loadActivityEntries } from "@/lib/portal-activity-entries";
import { ActivitiesTab } from "@/components/portal/ActivitiesTab";

export const dynamic = "force-dynamic";

/**
 * The bar's Activities tab: every kind of activity on one page (D178, D179), as cards sorted
 * into To choose, Booked, Open to you and Done by `ActivitiesTab`. Every card opens the
 * activity's own page, where the booking, the form or the stamp grid is.
 */
export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const { bookings, submissions, passports } = await loadActivityEntries(event, attendee);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold">Activities</h1>
      <ActivitiesTab bookings={bookings} submissions={submissions} passports={passports} basePath={`/e/${slug}/a/${token}`} />
    </div>
  );
}
