import { requireAdmin } from "@/lib/auth";
import { RouteModal } from "@/components/admin/RouteModal";
import { AttendeeDetail, loadAttendeeDetail } from "@/components/admin/AttendeeDetail";

export default async function AttendeeModalPage({ params, searchParams }: { params: Promise<{ id: string; attendeeId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id, attendeeId } = await params;
  const { saved, error } = await searchParams;
  const { orgId } = await requireAdmin();
  const data = await loadAttendeeDetail(id, attendeeId, orgId);
  // Deleting from inside the panel navigates back to the list; if the slot is still
  // holding this route when that happens, there is nothing left to show.
  if (!data) return null;
  return (
    <RouteModal label={data.a.name}>
      <AttendeeDetail data={data} saved={saved} error={error} />
    </RouteModal>
  );
}
