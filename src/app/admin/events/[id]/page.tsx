import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { CheckpointProgress } from "@/components/admin/CheckpointProgress";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { recentScans, countByCheckpoint } from "@/lib/checkins-stats";
import { checkpointsByDay } from "@/lib/checkpoints";

export const metadata = { title: "Overview · Orange Lobby" };

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);

  const counts = countByCheckpoint(checkins);
  const checkedIn = new Set(checkins.map((c) => c.attendee_id)).size;
  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const scans = recentScans(checkins, attendees, 11);
  const days = checkpointsByDay(cps).map(({ day, items }) => ({
    day,
    items: items.map((c) => ({ checkpoint: c, count: counts[c.id] ?? 0 })),
  }));

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Overview"
        subtitle={`${ev.name} · ${checkedIn} of ${total} checked in`}
        actions={<a href={`/scan/${ev.id}`} className={buttonClass("primary")}><Icon name="scan" size={18} />Open scanner</a>}
      />
      {/* Scans on the left because that is the column that keeps growing; the short
          cards go right, which is what stops the dead space this layout used to have. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecentScans rows={scans} checkpointNames={cpNames} live={<AutoRefresh seconds={15} />} />
        <div className="flex flex-col gap-6">
          <SummaryCard checkedIn={checkedIn} registered={total} />
          <CheckpointProgress days={days} registered={total} />
        </div>
      </div>
    </div>
  );
}
