import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getAttendee } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { attendeeCheckins } from "@/lib/checkins-stats";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { isoToLocalInput } from "@/lib/time";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { updateAttendeeAction, regenerateTokenAction, deleteAttendeeAction, removeCheckinAction } from "../../actions";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const hhmm = (iso: string) => isoToLocalInput(iso).split("T")[1] ?? "";

export default async function AttendeePage({ params, searchParams }: { params: Promise<{ id: string; attendeeId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id, attendeeId } = await params;
  const { saved, error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) notFound();
  const [cps, checkins] = await Promise.all([listCheckpoints(ev.id), listCheckinsForEvent(ev.id)]);
  const scans = attendeeCheckins(a.id, checkins);
  const link = attendeeLink(appBaseUrl(), ev.slug, a.token);
  const qr = await qrDataUrl(link);
  return (
    <div className="grid gap-6 items-start xl:grid-cols-[1fr_360px]">
      <form action={updateAttendeeAction.bind(null, ev.id, a.id)} className="grid gap-3 rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] md:grid-cols-2">
        {saved && <p className="text-sm text-green-700 md:col-span-2">Saved.</p>}
        {error && <p className="text-sm text-red-700 md:col-span-2">{error}</p>}
        <Field label="Name" name="name" defaultValue={a.name} /><Field label="Email" name="email" defaultValue={a.email} />
        <Field label="Phone" name="phone" defaultValue={a.phone} /><Field label="Company" name="company" defaultValue={a.company} />
        <Field label="Category" name="category" defaultValue={a.category} /><Field label="Table" name="table_no" defaultValue={a.table_no} />
        <Field label="Seat" name="seat_no" defaultValue={a.seat_no} />
        <div className="md:col-span-2"><Field label="Extra (JSON)" name="extra" textarea defaultValue={JSON.stringify(a.extra, null, 2)} /></div>
        <div className="md:col-span-2"><SubmitButton>Save</SubmitButton></div>
      </form>
      <div className="space-y-6">
        <Card className="p-4">
          <h2 className="mb-3 text-[17px] font-extrabold">Check-in</h2>
          {cps.length === 0 ? (
            <p className="text-sm text-muted">No checkpoints yet. Add them under Checkpoints.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {cps.map((cp) => {
                const at = scans[cp.id];
                return (
                  <li key={cp.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{cp.name}</div>
                      <div className="mt-1">
                        {at
                          ? <Badge tone="ok" dot>In at {hhmm(at)}</Badge>
                          : <span className="text-xs font-semibold text-muted">Not checked in</span>}
                      </div>
                    </div>
                    {/* Only a real check-in can be removed, so the control appears only where there is one. */}
                    {at && (
                      <form action={removeCheckinAction.bind(null, ev.id, cp.id, a.id)}>
                        <ConfirmButton message={`Remove the check-in for ${a.name} at ${cp.name}? They will need to be scanned again.`} className="text-red-700">Remove</ConfirmButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4 text-center shadow-[var(--shadow-card)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Attendee QR code" width={160} height={160} className="mx-auto h-40 w-40" />
          <a href={link} className="block break-all text-xs text-brand-ink">{link}</a>
          <form action={regenerateTokenAction.bind(null, ev.id, a.id)}><ConfirmButton message="Regenerate link? The old QR stops working.">Regenerate link</ConfirmButton></form>
          <form action={deleteAttendeeAction.bind(null, ev.id, a.id)}><ConfirmButton message="Delete this attendee?" className="text-red-700">Delete</ConfirmButton></form>
        </div>
      </div>
    </div>
  );
}
