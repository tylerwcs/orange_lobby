import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listEvents } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { Sidebar } from "@/components/admin/Sidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createEventAction } from "./[id]/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDateRange } from "@/lib/text";

export const metadata = { title: "All events · Orange Lobby" };

export default async function AdminHome() {
  const { orgId, email } = await requireAdmin();
  const events = await listEvents(orgId);
  const counts = await Promise.all(events.map((e) => countAttendees(e.id)));
  return (
    <>
      <Sidebar email={email} />
      <main id="main" className="min-w-0 flex-1 p-3 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
        <AdminHeader
          title="Events"
          actions={
            <Modal title="New event" hint="You can change everything else later, but not the link slug once badges are printed." trigger="New event" icon="plus" variant="primary">
              <form action={createEventAction} className="grid gap-4">
                <Field label="Event name" name="name" placeholder="Ecopia Kick-Off Meeting 2026" />
                <div>
                  <Field label="Link slug" name="slug" placeholder="auto from the name" />
                  <p className="mt-1 text-xs text-muted">Appears in every attendee link, so it cannot change after badges are printed.</p>
                </div>
                <SubmitButton>Create event</SubmitButton>
                <p className="text-xs text-muted">Next: settings and modules, then checkpoints, then import the masterlist or open registration. Draft links show &ldquo;Coming soon&rdquo; until you set the status to live.</p>
              </form>
            </Modal>
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {events.map((e, i) => (
            <Link key={e.id} href={`/admin/events/${e.id}`}>
              <Card className="p-4">
                <div className="font-extrabold">{e.name}</div>
                <div className="mt-1 text-xs text-muted">{formatDateRange(e.starts_on, e.ends_on)}</div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge tone={e.status === "live" ? "brand" : e.status === "archived" ? "ink" : "neutral"}>{e.status}</Badge>
                  <span className="text-xs text-muted">{counts[i]} attendees</span>
                </div>
              </Card>
            </Link>
          ))}
          {events.length === 0 && <p className="text-muted">No events yet. Create one to get started.</p>}
        </div>
      </main>
    </>
  );
}
