import { notFound } from "next/navigation";
import { PassportDetail } from "./PassportDetail";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { COVER_HINT, SubmissionFields } from "@/components/admin/ActivityRows";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { ActivityMenu } from "@/components/admin/ActivityMenu";
import { removeWarning } from "@/lib/activity-row";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getActivity, listSessions, listBookings, countBookingsBySession, submissionsForActivity } from "@/lib/db/activities";
import { listRequests } from "@/lib/db/activity-requests";
import { listAttendees } from "@/lib/db/attendees";
import { scannerNames } from "@/lib/db/users";
import { seatsFor, unbookedByActivity, sessionLabel } from "@/lib/activities";
import { capSummary, missingFrom, participation } from "@/lib/submissions";
import { nowInKL } from "@/lib/time";
import type { Activity, Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SessionList } from "@/components/admin/SessionList";
import { UnbookedPanel } from "@/components/admin/UnbookedPanel";
import { RequestQueue } from "@/components/admin/RequestQueue";
import { SubmissionTable } from "@/components/admin/SubmissionTable";
import { MissingPanel } from "@/components/admin/MissingPanel";
import { ParticipationPanel } from "@/components/admin/ParticipationPanel";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Field } from "@/components/admin/Field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveActivityAction, toggleOpenAction, deleteActivityAction, saveSubmissionActivityAction, deleteSubmissionActivityAction,
  addSessionAction, saveSessionAction,
  deleteSessionAction, reorderSessionsAction, placeAttendeesAction, approveRequestAction, declineRequestAction,
  uploadActivityImageAction,
} from "../actions";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function ActivityDetail({ params, searchParams }: {
  params: Promise<{ id: string; activityId: string }>;
  searchParams: Promise<{ day?: string; qr?: string }>;
}) {
  const { id, activityId } = await params;
  const { day: requestedDay, qr } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) notFound();

  // Three entirely different screens share this route because they share everything ABOVE this
  // point — the event guard, the not-found check — and nothing below it (D178). A booking
  // activity has sessions, requests and an unbooked list; a submission activity has answers,
  // a chasing list and a participation strip; a passport has its booths and their scanner
  // links (D190). None of the three reads another's data.
  if (activity.kind === "passport") return <PassportDetail ev={ev} activity={activity} qr={qr} />;
  if (activity.kind === "submission") return <SubmissionDetail ev={ev} activity={activity} requestedDay={requestedDay} />;
  return <BookingDetail ev={ev} activity={activity} />;
}

async function BookingDetail({ ev, activity }: { ev: Event; activity: Activity }) {
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
  const sessionLabelById = new Map(allSessions.map((s) => [s.id, sessionLabel(s)]));
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
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, "page")} name={activity.name} showLabel />
            <ActivityMenu
              name={activity.name}
              settingsHref="#settings"
              exportHref={`/admin/events/${ev.id}/export/activities.xlsx`}
              remove={deleteActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "booking", sessions: sessions.length, bookings: activityBookings.length })}
            />
          </>
        }
      />

      <RequestQueue
        pending={pendingRequests}
        decided={decidedRequests}
        sessionTitle={(sessionId) => sessionLabelById.get(sessionId) ?? "a deleted session"}
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
              label: sessionLabel(s.session),
              left: s.left,
            }))}
            place={placeAttendeesAction.bind(null, ev.id, activity.id)}
          />
        </CardContent>
      </Card>

      {/* Deliberately no `is_open` field here (D127): that column is the header
          button's alone. Adding it back would let saving this form silently close or
          reopen booking whenever an organiser only meant to edit the name. */}
      <Card id="settings" className="scroll-mt-4 overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="px-6 py-4">
          <form action={saveActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <Field label="Name" name="name" defaultValue={activity.name} />
            <RichTextEditor name="description" label="Description (optional)" defaultValue={activity.description} description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
            <ImageField label="Image (optional)" name="image" url={activity.image_url} description={COVER_HINT} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="max_per_attendee" className="text-sm font-bold">Sessions per person</label>
              <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={10}
                defaultValue={activity.max_per_attendee ?? undefined} inputMode="numeric" className={`${input} tabular-nums`} />
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

async function SubmissionDetail({ ev, activity, requestedDay }: { ev: Event; activity: Activity; requestedDay?: string }) {
  const [submissions, attendees] = await Promise.all([submissionsForActivity(activity.id), listAttendees(ev.id)]);
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const submitterFor = (attendeeId: string) => {
    const a = attendeeById.get(attendeeId);
    return { name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null };
  };

  // Which question the chasing list is answering, decided HERE rather than inside
  // `missingFrom`, so the rule is visible where somebody reads the page (D175): a per-day
  // activity asks about one day, anything else asks whether they ever submitted at all.
  const today = nowInKL().date;
  const day = activity.per_day ? (requestedDay || today) : null;
  const missing = missingFrom(activity, submissions, attendees.map((a) => a.id), (aid) => attendeeById.get(aid)?.category ?? null, day)
    .map((aid) => {
      const a = attendeeById.get(aid)!;
      return { id: a.id, name: a.name, category: a.category };
    });

  // Only a per-day activity has a pattern over time worth drawing: on a once-only activity
  // every row would be a single mark, which is a fact the submissions table already carries.
  const PARTICIPATION_DAYS = 14;
  const drifting = activity.per_day
    ? participation(activity, submissions, attendees.map((a) => a.id), (aid) => attendeeById.get(aid)?.category ?? null, today, PARTICIPATION_DAYS)
        .map((r) => {
          const a = attendeeById.get(r.attendeeId)!;
          return { ...r, name: a.name, category: a.category };
        })
    : null;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${submissions.length} submission${submissions.length === 1 ? "" : "s"} · ${capSummary(activity)}`}
        actions={
          <>
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, "page")} name={activity.name} showLabel />
            <ActivityMenu
              name={activity.name}
              settingsHref="#settings"
              exportHref={`/admin/events/${ev.id}/export/submissions.xlsx`}
              remove={deleteSubmissionActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "submission", submissions: submissions.length })}
            />
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Submissions</CardTitle></CardHeader>
        <CardContent className="px-0">
          <SubmissionTable submissions={submissions} questions={activity.questions} submitterFor={submitterFor} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Not submitted · {missing.length}</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <MissingPanel
            people={missing}
            day={day}
            today={today}
            basePath={`/admin/events/${ev.id}/activities/${activity.id}`}
          />
        </CardContent>
      </Card>

      {drifting && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b"><CardTitle>Participation</CardTitle></CardHeader>
          <CardContent className="px-6 py-4">
            <ParticipationPanel people={drifting} windowDays={PARTICIPATION_DAYS} today={today} />
          </CardContent>
        </Card>
      )}

      {/* Its settings live here, as every other kind's do, rather than in a modal on the list. */}
      <Card id="settings" className="scroll-mt-4 overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="px-6 py-4">
          <form action={saveSubmissionActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <SubmissionFields activity={activity} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
            <SubmitButton>Save settings</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
