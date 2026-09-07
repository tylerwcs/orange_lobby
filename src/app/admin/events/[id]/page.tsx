import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { appBaseUrl, genericLink, registrationLink } from "@/lib/links";
import { setStatusAction } from "./actions";
import type { EventStatus } from "@/lib/types";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const base = appBaseUrl();
  const statuses: EventStatus[] = ["draft", "live", "archived"];
  return (
    <div className="space-y-6">
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
        <h2 className="mb-2 font-medium">Exports</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="rounded border px-3 py-1" href={`/admin/events/${ev.id}/export/qr.zip`}>QR codes (ZIP)</a>
          <a className="rounded border px-3 py-1" href={`/admin/events/${ev.id}/export/links.xlsx`}>Links (Excel)</a>
          <a className="rounded border px-3 py-1" href={`/admin/events/${ev.id}/export/attendance.xlsx`}>Attendance (Excel)</a>
        </div>
      </section>
    </div>
  );
}
