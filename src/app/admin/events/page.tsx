import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listEvents } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { Sidebar } from "@/components/admin/Sidebar";
import { Card, ButtonLink } from "@/components/ui/Card";
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
      <main id="main" className="min-w-0 flex-1 p-6 lg:p-8 2xl:p-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Events</h1>
          <ButtonLink href="/admin/events/new" icon="star">New event</ButtonLink>
        </div>
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
          {events.length === 0 && <p className="text-muted">No events yet.</p>}
        </div>
      </main>
    </>
  );
}
