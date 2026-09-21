import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities, listSessions, countBookingsBySession } from "@/lib/db/activities";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ActivityRows } from "@/components/admin/ActivityRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addActivityAction } from "./actions";

export const metadata = { title: "Activities · Orange Lobby" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function Activities({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [activities, sessions, bookings] = await Promise.all([
    listActivities(ev.id), listSessions(ev.id), countBookingsBySession(ev.id),
  ]);

  // Rolled up from the sessions already loaded rather than queried per activity: the page
  // shows one line each, and a query per row is how a ten-activity event gets slow.
  const counts: Record<string, number> = {};
  const seats: Record<string, number> = {};
  for (const s of sessions) {
    counts[s.activity_id] = (counts[s.activity_id] ?? 0) + (bookings[s.id] ?? 0);
    seats[s.activity_id] = (seats[s.activity_id] ?? 0) + s.capacity;
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Activities"
        subtitle="Attendees book these themselves, first come first served. Breakout rooms, which you assign from the agenda, are a separate thing."
        actions={
          <Modal title="Add an activity" hint="Add its sessions once it exists." trigger="Add activity" icon="plus">
            <form action={addActivityAction.bind(null, ev.id)} className="grid gap-4">
              <Field label="Name" name="name" placeholder="Workshops" />
              <Field label="Description (optional)" name="description" textarea placeholder="Pick the track you want to join on Friday morning." />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="max_per_attendee" className="text-sm font-bold">Sessions per person</label>
                <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={10}
                  defaultValue={1} inputMode="numeric" className={`${input} tabular-nums`} />
              </div>
              <Field label="Categories (optional)" name="categories" placeholder="VIP, Management"
                description="Comma separated. Leave blank to offer it to everyone." />
              <label className={check}>
                <input type="checkbox" name="required" className="size-4" />
                Everyone must pick one
              </label>
              <label className={check}>
                <input type="checkbox" name="booking_open" className="size-4" />
                Open for booking now
              </label>
              <SubmitButton>Add activity</SubmitButton>
            </form>
          </Modal>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Activities</CardTitle></CardHeader>
        <CardContent className="px-6">
          <ActivityRows items={activities} counts={counts} seats={seats} basePath={`/admin/events/${ev.id}`} />
        </CardContent>
      </Card>
    </div>
  );
}
