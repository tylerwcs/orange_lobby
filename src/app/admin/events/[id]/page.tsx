import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { appBaseUrl, genericLink, registrationLink } from "@/lib/links";
import { setStatusAction, purgeEventAction } from "./actions";
import type { EventStatus } from "@/lib/types";
import { countAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { CheckInPanel } from "@/components/admin/CheckInPanel";
import { GlanceCard } from "@/components/admin/GlanceCard";
import { RecentScans } from "@/components/admin/RecentScans";
import { arrivalBuckets, recentScans, countByCheckpoint } from "@/lib/checkins-stats";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { listAttendees } from "@/lib/db/attendees";
import { nowInKL, isoToLocalInput } from "@/lib/time";

export const metadata = { title: "Overview · Orange Lobby" };

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; purged?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const base = appBaseUrl();
  const statuses: EventStatus[] = ["draft", "live", "archived"];
  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);
  const today = nowInKL().date;
  const counts = countByCheckpoint(checkins);
  const firstCp = cps[0]?.id;
  const firstCpName = cps[0]?.name;
  const checkedIn = new Set(checkins.map((c) => c.attendee_id)).size;
  const walkIns = attendees.filter((a) => a.source === "walkin").length;
  const buckets = arrivalBuckets(checkins, { day: today, from: "08:00", to: "12:00", minutes: 15, checkpointId: firstCp });
  const scans = recentScans(checkins, attendees, 8);
  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const registrationOpen = ev.registration_open && !(ev.registration_closes_at && new Date(ev.registration_closes_at) < new Date());
  const registrationHint = ev.registration_closes_at ? `Closes ${isoToLocalInput(ev.registration_closes_at).replace("T", " ")}` : undefined;
  return (
    <div className="space-y-6">
      <AdminHeader
        title="Overview"
        subtitle={`${ev.name} · ${checkedIn} of ${total} checked in`}
        actions={<a href={`/scan/${ev.id}`} className={buttonClass("primary")}><Icon name="scan" size={18} />Open scanner</a>}
      />
      {sp.error && <div className="rounded-[var(--radius-control)] border border-red-300 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>}
      {sp.purged && <div className="rounded-[var(--radius-control)] border border-green-300 bg-green-50 p-3 text-sm text-green-700">Personal data purged.</div>}
      <div className="grid items-start gap-6 xl:grid-cols-[1.75fr_1fr]">
        <CheckInPanel checkedIn={checkedIn} registered={total} buckets={buckets} checkpointName={firstCpName}
          checkpoints={cps.map((c) => ({ checkpoint: c, count: counts[c.id] ?? 0 }))} />
        <GlanceCard registered={total} checkedIn={checkedIn} walkIns={walkIns}
          registrationOpen={registrationOpen} registrationHint={registrationHint} eventId={ev.id} />
      </div>
      <RecentScans rows={scans} checkpointNames={cpNames} />
      <div className="grid gap-6 items-start xl:grid-cols-[3fr_2fr]">
      <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-2 font-bold">Links</h2>
        <div className="space-y-2">
          <div>
            <div className="text-xs text-muted">Generic</div>
            <a className="block rounded-[var(--radius-control)] bg-canvas p-2 text-xs break-all font-mono text-brand-ink" href={genericLink(base, ev.slug)}>{genericLink(base, ev.slug)}</a>
          </div>
          <div>
            <div className="text-xs text-muted">Registration</div>
            <a className="block rounded-[var(--radius-control)] bg-canvas p-2 text-xs break-all font-mono text-brand-ink" href={registrationLink(base, ev.slug)}>{registrationLink(base, ev.slug)}</a>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 font-bold">Exports</h2>
        {/* Plain anchors, not `<Link>`: prefetching an export route would build the file on hover. */}
        <div className="flex flex-wrap gap-3">
          <a download href={`/admin/events/${ev.id}/export/qr.zip`} className={buttonClass("secondary")}><Icon name="qr" size={18} />QR codes (ZIP)</a>
          <a download href={`/admin/events/${ev.id}/export/links.xlsx`} className={buttonClass("secondary")}><Icon name="link" size={18} />Links (Excel)</a>
          <a download href={`/admin/events/${ev.id}/export/attendance.xlsx`} className={buttonClass("secondary")}><Icon name="file" size={18} />Attendance (Excel)</a>
        </div>
        <p className="mt-2 text-xs text-muted">Links are generated for: {base}</p>
      </Card>
      </div>
      <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-2 font-bold">Status</h2>
        <p className="mb-2 text-xs text-muted">Draft shows &ldquo;Coming soon&rdquo; on every link. Live opens the portal. Archived makes it read-only.</p>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <form key={s} action={setStatusAction.bind(null, ev.id, s)}>
              <button className={`rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-sm font-bold ${ev.status === s ? "border-ink bg-ink text-white" : ""}`}>{s}</button>
            </form>
          ))}
        </div>
      </Card>
      {ev.status === "archived" && (
        <Card className="p-4">
          <form action={purgeEventAction.bind(null, ev.id)}>
            <h2 className="mb-2 font-bold text-red-700">Purge personal data</h2>
            <p className="mb-2 text-sm text-muted">Replaces names, emails, phones, companies and extra fields. Attendance counts are kept. Cannot be undone.</p>
            <ConfirmButton message="Purge all attendee personal data for this event? This cannot be undone." className="text-red-700">Purge</ConfirmButton>
          </form>
        </Card>
      )}
      </div>
      </div>
    </div>
  );
}
