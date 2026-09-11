import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { appBaseUrl } from "@/lib/links";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Card, buttonClass } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";

export const metadata = { title: "Exports · Orange Lobby" };

export default async function ExportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const total = await countAttendees(ev.id);
  const base = appBaseUrl();
  const b = `/admin/events/${ev.id}/export`;

  const files: { href: string; icon: IconName; name: string; what: string }[] = [
    {
      href: `${b}/attendance.xlsx`, icon: "file", name: "Attendance",
      what: "One row per attendee, with three columns for every checkpoint: whether they were checked in, the time, and which crew account scanned them. Includes any extra scan fields you configured.",
    },
    {
      href: `${b}/links.xlsx`, icon: "link", name: "Personal links",
      what: "Name, email, company, category, table, seat and each attendee's personal portal link. This is the sheet to mail-merge from.",
    },
    {
      href: `${b}/qr.zip`, icon: "qr", name: "QR codes",
      what: "One PNG per attendee, named after them, each encoding their personal link. This is what goes to the badge printer.",
    },
  ];

  return (
    <div className="space-y-6">
      <AdminHeader title="Exports" subtitle={`${ev.name} · ${total} attendees`} />

      <div className="grid gap-4 xl:grid-cols-3">
        {files.map((f) => (
          <Card key={f.href} className="flex flex-col gap-3 p-5">
            <h2 className="text-[17px] font-extrabold">{f.name}</h2>
            <p className="flex-1 text-sm text-muted">{f.what}</p>
            {/* Plain anchors, not `<Link>`: prefetching an export route would build the file on hover. */}
            <a download href={f.href} className={`${buttonClass("secondary")} self-start`}>
              <Icon name={f.icon} size={18} />Download
            </a>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-[17px] font-extrabold">Before you send these out</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>Personal links and QR codes are generated for <span className="font-bold text-ink">{base}</span>. If that address changes, re-export before printing.</li>
          <li>A personal link signs the holder in without a password. Treat both files as you would the attendee list itself.</li>
          <li>Regenerating an attendee&rsquo;s link from their detail page invalidates the QR code already printed on their badge.</li>
        </ul>
      </Card>
    </div>
  );
}
