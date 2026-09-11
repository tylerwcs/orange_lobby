import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { RouteModal } from "@/components/admin/RouteModal";
import { AttendeeDetail, loadAttendeeDetail } from "@/components/admin/AttendeeDetail";
import { AttendeeDetailSkeleton } from "@/components/admin/AttendeeDetailSkeleton";

type Params = Promise<{ id: string; attendeeId: string }>;
type Search = Promise<{ saved?: string; error?: string }>;

async function Content({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id, attendeeId } = await params;
  const { saved, error } = await searchParams;
  const { orgId } = await requireAdmin();
  const data = await loadAttendeeDetail(id, attendeeId, orgId);
  // Deleting from inside the panel navigates back to the list; if the slot is still
  // holding this route when that happens, there is nothing left to show.
  if (!data) return <p className="py-12 text-center text-sm text-muted">This attendee is no longer on the list.</p>;
  return <AttendeeDetail data={data} saved={saved} error={error} />;
}

/**
 * Deliberately not `async`: nothing is awaited before the dialog, so the shell streams
 * out first and the panel is on screen while the attendee, their check-ins and their QR
 * are still being fetched. Everything that touches the database sits inside the boundary.
 */
export default function AttendeeModalPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <RouteModal label="Attendee">
      <Suspense fallback={<AttendeeDetailSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </RouteModal>
  );
}
