import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getActivity, listSessions, listBookings, countBookingsBySession } from "@/lib/db/activities";
import { listAttendees } from "@/lib/db/attendees";
import { seatsFor, eligible, unbookedIds } from "@/lib/activities";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SessionList } from "@/components/admin/SessionList";
import { UnbookedPanel } from "@/components/admin/UnbookedPanel";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Field } from "@/components/admin/Field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveActivityAction, toggleBookingAction, addSessionAction, saveSessionAction,
  deleteSessionAction, reorderSessionsAction, placeAttendeesAction,
} from "../actions";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function ActivityDetail({ params }: { params: Promise<{ id: string; activityId: string }> }) {
  const { id, activityId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) notFound();

  const [allSessions, bookings, counts, attendees] = await Promise.all([
    listSessions(ev.id), listBookings(ev.id), countBookingsBySession(ev.id), listAttendees(ev.id),
  ]);
  const sessions = allSessions.filter((s) => s.activity_id === activity.id);
  const seats = sessions.map((s) => seatsFor(s, counts[s.id] ?? 0));

  // Who still owes a choice: eligible, and holding nothing in THIS activity. `listAttendees`
  // is already ordered by name, and unbookedIds keeps that order, which is what a list
  // somebody reads down wants.
  const booked = new Set(bookings.filter((b) => b.activity_id === activity.id).map((b) => b.attendee_id));
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const unbooked = unbookedIds(
    attendees.map((a) => a.id),
    (attendeeId) => eligible(activity, byId.get(attendeeId)?.category ?? null),
    booked,
  );

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${booked.size} of ${attendees.length} have booked · ${seats.reduce((n, s) => n + s.left, 0)} seats left`}
        actions={
          <form action={toggleBookingAction.bind(null, ev.id, activity.id)}>
            <SubmitButton variant={activity.booking_open ? "outline" : "default"}>
              {activity.booking_open ? "Close booking" : "Open booking"}
            </SubmitButton>
          </form>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent className="px-6">
          <SessionList
            items={seats}
            addSession={addSessionAction.bind(null, ev.id, activity.id)}
            saveSession={saveSessionAction.bind(null, ev.id, activity.id)}
            deleteSession={deleteSessionAction.bind(null, ev.id, activity.id)}
            reorder={reorderSessionsAction.bind(null, ev.id, activity.id)}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Not booked yet · {unbooked.length}</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <UnbookedPanel
            people={unbooked.map((attendeeId) => {
              const a = byId.get(attendeeId)!;
              return { id: a.id, name: a.name, category: a.category };
            })}
            options={seats.filter((s) => !s.full).map((s) => ({
              id: s.session.id,
              label: `${s.session.title} · ${s.session.starts_at}`,
              left: s.left,
            }))}
            place={placeAttendeesAction.bind(null, ev.id, activity.id)}
          />
        </CardContent>
      </Card>

      {/* Deliberately no `booking_open` field here (D127): that column is the header
          button's alone. Adding it back would let saving this form silently close or
          reopen booking whenever an organiser only meant to edit the name. */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="px-6 py-4">
          <form action={saveActivityAction.bind(null, ev.id, activity.id)} className="grid gap-4">
            <Field label="Name" name="name" defaultValue={activity.name} />
            <Field label="Description (optional)" name="description" textarea defaultValue={activity.description} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="max_per_attendee" className="text-sm font-bold">Sessions per person</label>
              <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={10}
                defaultValue={activity.max_per_attendee} inputMode="numeric" className={`${input} tabular-nums`} />
            </div>
            <Field label="Categories (optional)" name="categories" defaultValue={(activity.categories ?? []).join(", ")}
              placeholder="VIP, Management" description="Comma separated. Leave blank to offer it to everyone." />
            <label className={check}>
              <input type="checkbox" name="required" className="size-4" defaultChecked={activity.required} />
              Everyone must pick one
            </label>
            <SubmitButton>Save settings</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
