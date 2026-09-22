import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getActivity, listSessions, listBookings, countBookingsBySession } from "@/lib/db/activities";
import { listRequests } from "@/lib/db/activity-requests";
import { listAttendees } from "@/lib/db/attendees";
import { scannerNames } from "@/lib/db/users";
import { seatsFor, unbookedByActivity } from "@/lib/activities";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SessionList } from "@/components/admin/SessionList";
import { UnbookedPanel } from "@/components/admin/UnbookedPanel";
import { RequestQueue } from "@/components/admin/RequestQueue";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Field } from "@/components/admin/Field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveActivityAction, toggleBookingAction, deleteActivityAction, addSessionAction, saveSessionAction,
  deleteSessionAction, reorderSessionsAction, placeAttendeesAction, approveRequestAction, declineRequestAction,
} from "../actions";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function ActivityDetail({ params }: { params: Promise<{ id: string; activityId: string }> }) {
  const { id, activityId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) notFound();

  const [allSessions, bookings, counts, attendees, allRequests] = await Promise.all([
    listSessions(ev.id), listBookings(ev.id), countBookingsBySession(ev.id), listAttendees(ev.id), listRequests(ev.id),
  ]);
  const sessions = allSessions.filter((s) => s.activity_id === activity.id);
  const seats = sessions.map((s) => seatsFor(s, counts[s.id] ?? 0));
  const activityBookings = bookings.filter((b) => b.activity_id === activity.id);

  // `listRequests` already orders by `created_at`, so pending stays oldest-first without a
  // re-sort. "Decided" is everything else — approved, declined or withdrawn — which is what
  // sits behind the queue's "Show decided" disclosure (the desk is working the queue, not
  // reading the log).
  const activityRequests = allRequests.filter((r) => r.activity_id === activity.id);
  const pendingRequests = activityRequests.filter((r) => r.status === "pending");
  const decidedRequests = activityRequests.filter((r) => r.status !== "pending");
  const sessionTitleById = new Map(allSessions.map((s) => [s.id, s.title]));
  // Only the ids `decide_request` actually stamped — pending and withdrawn requests carry none.
  const deciderEmails = await scannerNames(decidedRequests.map((r) => r.decided_by));

  // Who still owes a choice: eligible, and holding nothing in THIS activity. Goes through the
  // same `unbookedByActivity` the xlsx export uses (D130) rather than computing it again here —
  // two implementations of "who has not booked" is how they end up disagreeing. `listAttendees`
  // is already ordered by name, and `unbookedByActivity` keeps that order, which is what a list
  // somebody reads down wants.
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const [unbookedForActivity] = unbookedByActivity(
    [activity], bookings, attendees.map((a) => a.id), (attendeeId) => byId.get(attendeeId)?.category ?? null,
  );
  const unbooked = unbookedForActivity?.attendeeIds ?? [];
  const bookedCount = new Set(activityBookings.map((b) => b.attendee_id)).size;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${bookedCount} of ${attendees.length} have booked · ${seats.reduce((n, s) => n + s.left, 0)} seats left`}
        actions={
          <>
            <form action={toggleBookingAction.bind(null, ev.id, activity.id)}>
              <SubmitButton variant={activity.booking_open ? "outline" : "default"}>
                {activity.booking_open ? "Close booking" : "Open booking"}
              </SubmitButton>
            </form>
            {/* Cascades sessions and bookings (D135), so the confirm dialog names both counts —
                the organiser is cancelling people's afternoons, not just tidying a list. */}
            <form action={deleteActivityAction.bind(null, ev.id, activity.id)}>
              <ConfirmButton
                message={`Delete ${activity.name}? Its ${sessions.length} session${sessions.length === 1 ? "" : "s"} and ${activityBookings.length} booking${activityBookings.length === 1 ? "" : "s"} go with it.`}
                className="text-destructive"
              >
                Delete activity
              </ConfirmButton>
            </form>
          </>
        }
      />

      <RequestQueue
        pending={pendingRequests}
        decided={decidedRequests}
        sessionTitle={(sessionId) => sessionTitleById.get(sessionId) ?? "a deleted session"}
        attendeeName={(attendeeId) => byId.get(attendeeId)?.name ?? "Unknown"}
        deciderEmails={deciderEmails}
        approve={approveRequestAction.bind(null, ev.id, activity.id)}
        decline={declineRequestAction.bind(null, ev.id, activity.id)}
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
