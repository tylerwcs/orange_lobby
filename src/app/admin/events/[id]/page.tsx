import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { appBaseUrl, genericLink, registrationLink } from "@/lib/links";
import { setStatusAction, purgeEventAction } from "./actions";
import type { EventStatus } from "@/lib/types";
import { countAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; purged?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const base = appBaseUrl();
  const statuses: EventStatus[] = ["draft", "live", "archived"];
  const [total, cps, counts] = await Promise.all([countAttendees(ev.id), listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id)]);
  return (
    <div className="space-y-6">
      {sp.error && <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700 text-sm">{decodeURIComponent(sp.error)}</div>}
      {sp.purged && <div className="rounded border border-green-300 bg-green-50 p-3 text-green-700 text-sm">Personal data purged.</div>}
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-medium">Links</h2>
        <p className="text-sm">Generic: <a className="text-orange-600" href={genericLink(base, ev.slug)}>{genericLink(base, ev.slug)}</a></p>
        <p className="text-sm">Registration: <a className="text-orange-600" href={registrationLink(base, ev.slug)}>{registrationLink(base, ev.slug)}</a></p>
      </section>
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-medium">Status</h2>
        <div className="flex gap-2">
          {statuses.map((s) => (
            <form key={s} action={setStatusAction.bind(null, ev.id, s)}>
              <button className={`rounded border px-3 py-1 text-sm ${ev.status === s ? "bg-orange-600 text-white" : ""}`}>{s}</button>
            </form>
          ))}
        </div>
      </section>
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-medium">Counts</h2>
        <p className="text-sm">Attendees: {total}</p>
        {cps.map((c) => <p key={c.id} className="text-sm">{c.name}: {counts[c.id] ?? 0} checked in</p>)}
      </section>
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-medium">Exports</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="rounded border px-3 py-1" href={`/admin/events/${ev.id}/export/qr.zip`}>QR codes (ZIP)</a>
          <a className="rounded border px-3 py-1" href={`/admin/events/${ev.id}/export/links.xlsx`}>Links (Excel)</a>
          <a className="rounded border px-3 py-1" href={`/admin/events/${ev.id}/export/attendance.xlsx`}>Attendance (Excel)</a>
        </div>
      </section>
      {ev.status === "archived" && (
        <form action={purgeEventAction.bind(null, ev.id)} className="rounded border border-red-300 bg-white p-4">
          <h2 className="mb-2 font-medium text-red-700">Purge personal data</h2>
          <p className="mb-2 text-sm text-gray-600">Replaces names, emails, phones, companies and extra fields. Attendance counts are kept. Cannot be undone.</p>
          <ConfirmButton message="Purge all attendee personal data for this event? This cannot be undone." className="text-red-700">Purge</ConfirmButton>
        </form>
      )}
    </div>
  );
}
