import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { checkedInCount, recentScans } from "@/lib/checkins-stats";
import { activeCheckpoint, checkpointsByDay } from "@/lib/checkpoints";
import { nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";

export const metadata = { title: "Overview · Orange Lobby" };

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);

  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const scans = recentScans(checkins, attendees, 11);

  // No picker here: the checkpoint comes from the one switch in Settings, so this page and
  // the scanner and a bulk check-in can never disagree about which door is being worked.
  const running = activeCheckpoint(ev.active_checkpoint_id, cps, nowInKL().date);
  const multiDay = checkpointsByDay(cps).length > 1;
  const scope = running ? `${running.name}${multiDay ? ` · ${shortDate(running.day)}` : ""}` : null;

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Overview"
        subtitle={`${ev.name} · ${total} registered`}
        actions={<a href={`/scan/${ev.id}`} className={buttonClass("primary")}><Icon name="scan" size={18} />Open scanner</a>}
      />
      {/* Scans on the left because that is the column that keeps growing; the short
          cards go right, which is what stops the dead space this layout used to have. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecentScans rows={scans} checkpointNames={cpNames} live={<AutoRefresh seconds={15} />} />
        <SummaryCard
          eventId={ev.id}
          checkedIn={checkedInCount(checkins, running?.id ?? null)}
          registered={total}
          scope={scope}
        />
      </div>
    </div>
  );
}
