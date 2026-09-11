import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { ArrivalsPanel } from "@/components/admin/ArrivalsPanel";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { arrivalBuckets, arrivalWindow, recentScans, countByCheckpoint } from "@/lib/checkins-stats";
import { nowInKL, eventDays } from "@/lib/time";
import { shortDate } from "@/lib/text";

export const metadata = { title: "Overview · Orange Lobby" };

const BUCKET_MINUTES = 15;

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string; cp?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);

  const today = nowInKL().date;
  const days = eventDays(ev.starts_on, ev.ends_on);
  // Land on the day being run if the event is on, otherwise its first day.
  const day = days.includes(sp.day ?? "") ? sp.day! : days.includes(today) ? today : days[0] ?? today;
  const cpId = cps.some((c) => c.id === sp.cp) ? sp.cp! : cps[0]?.id;
  const cpName = cps.find((c) => c.id === cpId)?.name;

  const counts = countByCheckpoint(checkins);
  const checkedIn = new Set(checkins.map((c) => c.attendee_id)).size;
  const walkIns = attendees.filter((a) => a.source === "walkin").length;
  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const scans = recentScans(checkins, attendees, 11);

  // The window comes from the scans themselves: a fixed one shows empty bars on a day
  // whose door opened outside it, and hides arrivals that fell either side.
  const window = arrivalWindow(checkins, { day, minutes: BUCKET_MINUTES, checkpointId: cpId });
  const buckets = window
    ? arrivalBuckets(checkins, { day, from: window.from, to: window.to, minutes: BUCKET_MINUTES, checkpointId: cpId })
    : [];

  const at = cpName ? ` · ${cpName}` : "";
  const on = days.length > 1 ? ` · ${shortDate(day)}` : "";
  const chipHref = (next: { day?: string; cp?: string }) => {
    const p = new URLSearchParams();
    p.set("day", next.day ?? day);
    const cp = next.cp ?? cpId;
    if (cp) p.set("cp", cp);
    return `/admin/events/${ev.id}?${p.toString()}`;
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3.5 text-xs font-bold ${active ? "bg-ink text-white" : "bg-canvas text-ink hover:brightness-95"}`;

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Overview"
        subtitle={`${ev.name} · ${checkedIn} of ${total} checked in`}
        actions={<a href={`/scan/${ev.id}`} className={buttonClass("primary")}><Icon name="scan" size={18} />Open scanner</a>}
      />
      {/* Scans on the left because that is the column that keeps growing; the short
          cards go right, which is what stops the dead space this layout used to have. */}
      <div className="grid items-start gap-6 xl:grid-cols-[1.55fr_1fr]">
        <RecentScans rows={scans} checkpointNames={cpNames} live={<AutoRefresh seconds={15} />} />
        <div className="flex flex-col gap-6">
          <SummaryCard checkedIn={checkedIn} registered={total} walkIns={walkIns} />
          <ArrivalsPanel
            buckets={buckets}
            registered={total}
            checkpoints={cps.map((c) => ({ checkpoint: c, count: counts[c.id] ?? 0 }))}
            chartLabel={`Per ${BUCKET_MINUTES} minutes${at}${on}`}
            emptyChartLabel={`No arrivals yet${cpName ? ` at ${cpName}` : ""}${days.length > 1 ? ` on ${shortDate(day)}` : ""}.`}
            controls={(days.length > 1 || cps.length > 1) && (
              <>
                {days.length > 1 && days.map((d) => (
                  <Link key={d} href={chipHref({ day: d })} aria-current={d === day ? "true" : undefined} className={chip(d === day)}>{shortDate(d)}</Link>
                ))}
                {cps.length > 1 && cps.map((c) => (
                  <Link key={c.id} href={chipHref({ cp: c.id })} aria-current={c.id === cpId ? "true" : undefined} className={chip(c.id === cpId)}>{c.name}</Link>
                ))}
              </>
            )}
          />
        </div>
      </div>
    </div>
  );
}
