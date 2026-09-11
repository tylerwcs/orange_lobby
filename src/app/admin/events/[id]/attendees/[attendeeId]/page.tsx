import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { AttendeeDetail, loadAttendeeDetail } from "@/components/admin/AttendeeDetail";

export default async function AttendeePage({ params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const { id, attendeeId } = await params;
  const { orgId } = await requireAdmin();
  const data = await loadAttendeeDetail(id, attendeeId, orgId);
  if (!data) notFound();
  return (
    <Card className="mx-auto max-w-5xl p-5">
      <AttendeeDetail data={data} />
    </Card>
  );
}
