import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getAttendee } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { updateAttendeeAction, regenerateTokenAction, deleteAttendeeAction } from "../../actions";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

export default async function AttendeePage({ params, searchParams }: { params: Promise<{ id: string; attendeeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id, attendeeId } = await params;
  const { saved } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) notFound();
  const link = attendeeLink(appBaseUrl(), ev.slug, a.token);
  const qr = await qrDataUrl(link);
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <form action={updateAttendeeAction.bind(null, ev.id, a.id)} className="space-y-3 rounded border bg-white p-4 md:col-span-2">
        {saved && <p className="text-sm text-green-700">Saved.</p>}
        <Field label="Name" name="name" defaultValue={a.name} /><Field label="Email" name="email" defaultValue={a.email} />
        <Field label="Phone" name="phone" defaultValue={a.phone} /><Field label="Company" name="company" defaultValue={a.company} />
        <Field label="Category" name="category" defaultValue={a.category} /><Field label="Table" name="table_no" defaultValue={a.table_no} />
        <Field label="Seat" name="seat_no" defaultValue={a.seat_no} />
        <Field label="Extra (JSON)" name="extra" textarea defaultValue={JSON.stringify(a.extra, null, 2)} />
        <SubmitButton>Save</SubmitButton>
      </form>
      <div className="space-y-3 rounded border bg-white p-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR" className="mx-auto w-40" />
        <a href={link} className="block break-all text-xs text-orange-700">{link}</a>
        <form action={regenerateTokenAction.bind(null, ev.id, a.id)}><ConfirmButton message="Regenerate link? The old QR stops working.">Regenerate link</ConfirmButton></form>
        <form action={deleteAttendeeAction.bind(null, ev.id, a.id)}><ConfirmButton message="Delete this attendee?" className="text-red-700">Delete</ConfirmButton></form>
      </div>
    </div>
  );
}
