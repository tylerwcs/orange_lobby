import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { RouteModal } from "@/components/admin/RouteModal";
import { AttendeeDetail, loadAttendeeDetail } from "@/components/admin/AttendeeDetail";
import { AttendeeDetailSkeleton } from "@/components/admin/AttendeeDetailSkeleton";

type Params = Promise<{ id: string; attendeeId: string }>;

async function Content({ params }: { params: Params }) {
  const { id, attendeeId } = await params;
  const { orgId } = await requireAdmin();
  const data = await loadAttendeeDetail(id, attendeeId, orgId);
  // Saving or deleting from inside the panel navigates to the list; if the slot is still
  // holding this route when that happens, there is nothing left to show.
  if (!data) return <p className="py-12 text-center text-sm text-muted">This attendee is no longer on the list.</p>;
  return <AttendeeDetail data={data} />;
}

/**
 * Only `params` is awaited here — route values, already known, no round trip. Everything
 * that touches the database sits inside the Suspense boundary, so the dialog streams out
 * first and is on screen while the attendee, their check-ins and their QR are fetched.
 */
export default async function AttendeeModalPage({ params }: { params: Params }) {
  const { id, attendeeId } = await params;
  return (
    <RouteModal label="Attendee" path={`/admin/events/${id}/attendees/${attendeeId}`}>
      <Suspense fallback={<AttendeeDetailSkeleton />}>
        <Content params={params} />
      </Suspense>
    </RouteModal>
  );
}
