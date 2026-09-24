import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listEvents } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createEventAction } from "../[id]/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { formatDateRange } from "@/lib/text";

export const metadata = { title: "All events" };

export default async function AdminHome() {
  const { orgId } = await requireAdmin();
  const events = await listEvents(orgId);
  const counts = await Promise.all(events.map((e) => countAttendees(e.id)));
  return (
    <>
        <AdminHeader
          title="Events"
          actions={
            <Modal title="New event" hint="You can change everything else later, but not the link slug once badges are printed." trigger="New event" icon="plus" variant="default">
              <form action={createEventAction} className="grid gap-4">
                <Field label="Event name" name="name" placeholder="Ecopia Kick-Off Meeting 2026" />
                <div>
                  <Field label="Link slug" name="slug" placeholder="auto from the name" />
                  <p className="mt-1 text-xs text-muted-foreground">Appears in every attendee link, so it cannot change after badges are printed.</p>
                </div>
                <SubmitButton>Create event</SubmitButton>
                <p className="text-xs text-muted-foreground">Next: settings and modules, then checkpoints, then import the masterlist or open registration. Draft links show &ldquo;Coming soon&rdquo; until you set the status to live.</p>
              </form>
            </Modal>
          }
        />
        <div className="@container"><div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
          {events.map((e, i) => (
            <Link key={e.id} href={`/admin/events/${e.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex flex-col gap-1">
                  <div className="font-extrabold">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{formatDateRange(e.starts_on, e.ends_on)}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge variant={e.status === "live" ? "success" : e.status === "archived" ? "outline" : "secondary"}>{e.status}</Badge>
                    <span className="text-xs text-muted-foreground">{counts[i]} attendees</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {events.length === 0 && (
            <Empty className="col-span-full">
              <EmptyHeader>
                <EmptyTitle>No events yet</EmptyTitle>
                <EmptyDescription>Create one to get started.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        </div>
    </>
  );
}
