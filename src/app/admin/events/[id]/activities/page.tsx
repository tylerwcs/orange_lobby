import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities, listSessions, countBookingsBySession, listSubmissions } from "@/lib/db/activities";
import { listBooths, listStampsForEvent } from "@/lib/db/booths";
import { passportRollup } from "@/lib/booths";
import { listRequests } from "@/lib/db/activity-requests";
import { listAttendees } from "@/lib/db/attendees";
import { pendingCountByActivity } from "@/lib/activity-requests";
import { eligible } from "@/lib/activities";
import { bookingRow, submissionRow, passportRow, listSummary, removeWarning } from "@/lib/activity-row";
import type { Activity, Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ActivityList, SubmissionFields, COVER_HINT, type ActivityListItem } from "@/components/admin/ActivityRows";
import { NewActivityMenu } from "@/components/admin/NewActivityMenu";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { Card, CardContent } from "@/components/ui/card";
import {
  addActivityAction, addSubmissionActivityAction, toggleOpenAction, addPassportActivityAction,
  deleteActivityAction, deleteSubmissionActivityAction, deletePassportActivityAction,
  uploadActivityImageAction,
} from "./actions";

export const metadata = { title: "Activities" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function Activities({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [activities, sessions, bookings, requests, submissions, booths, stamps, attendees] = await Promise.all([
    listActivities(ev.id), listSessions(ev.id), countBookingsBySession(ev.id), listRequests(ev.id), listSubmissions(ev.id),
    listBooths(ev.id), listStampsForEvent(ev.id), listAttendees(ev.id),
  ]);

  // Everything below is rolled up from what the page already loaded, rather than queried per
  // row: the page shows one line each, and a query per row is how a ten-activity event gets slow.
  const pending = pendingCountByActivity(requests);
  const passportCounts = passportRollup(activities.filter((a) => a.kind === "passport"), booths, stamps);
  // "Of M" is the people the activity is for, not everyone registered: a VIP-only activity that
  // every VIP has done is done.
  const audience = (a: Activity) => attendees.filter((p) => eligible(a, p.category)).length;

  const items = activities.map((a) => listItem(ev, a, {
    sessions: sessions.filter((s) => s.activity_id === a.id).map((s) => ({ day: s.day, capacity: s.capacity, booked: bookings[s.id] ?? 0 })),
    pending: pending[a.id] ?? 0,
    submissions: submissions.filter((s) => s.activity_id === a.id).map((s) => s.attendee_id),
    passport: passportCounts[a.id] ?? { booths: 0, completed: 0 },
    audience: audience(a),
  }));

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Activities"
        subtitle={listSummary(activities.map((a, i) => ({ open: a.is_open, attention: items[i].view.attention })))}
        actions={
          <NewActivityMenu
            forms={{
              booking: (
                <form action={addActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
  <Field label="Name" name="name" placeholder="Workshops" />
  <RichTextEditor name="description" label="Description (optional)" description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
  <ImageField label="Image (optional)" name="image" description={COVER_HINT} />
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
    <input type="checkbox" name="is_open" className="size-4" />
    Open for booking now
  </label>
  <SubmitButton>Add activity</SubmitButton>
              </form>
              ),
              submission: (
                <form action={addSubmissionActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
  <SubmissionFields uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
  <label className={check}>
    <input type="checkbox" name="submissions_open" className="size-4" />
    Open for submissions now
  </label>
  <SubmitButton>Add submission</SubmitButton>
              </form>
              ),
              passport: (
                <form action={addPassportActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
  <Field label="Name" name="name" defaultValue="Booth Passport" />
  <RichTextEditor name="description" label="Description (optional)" description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
  <ImageField label="Image (optional)" name="image" description={COVER_HINT} />
  <Field label="Categories (optional)" name="categories" placeholder="VIP, Management"
    description="Comma separated. Leave blank for everyone. Booths refuse anyone outside these." />
  <div className="flex flex-col gap-1.5">
    <label htmlFor="new_stamps_required" className="text-sm font-bold">Stamps needed</label>
    <input id="new_stamps_required" name="stamps_required" type="number" min={1} inputMode="numeric"
      placeholder="Every booth" className={`${input} tabular-nums`} />
  </div>
  <Field label="Message when the card is full (optional)" name="reward_message"
    placeholder="Show this screen at the registration counter to collect your gift." />
  {/* Checked by default, unlike booking: a passport nobody opened is booths that
      refuse every badge on the day (D184). */}
  <label className={check}>
    <input type="checkbox" name="is_open" className="size-4" defaultChecked />
    Open for stamping now
  </label>
  <SubmitButton>Add passport</SubmitButton>
              </form>
              ),
            }}
          />
        }
      />

      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <ActivityList items={items} />
        </CardContent>
      </Card>
    </div>
  );
}

type RowFacts = {
  sessions: { day: string; capacity: number; booked: number }[];
  pending: number;
  /** Attendee id of every submission, repeats included. */
  submissions: string[];
  passport: { booths: number; completed: number };
  audience: number;
};

/**
 * One row, every kind the same shape. What differs by kind is decided here and nowhere else:
 * which progress it counts (`bookingRow` and friends), which export and which delete its menu
 * binds, and what the delete confirmation warns will go with it.
 */
function listItem(ev: Event, a: Activity, facts: RowFacts): ActivityListItem {
  const href = `/admin/events/${ev.id}/activities/${a.id}`;
  const exports = `/admin/events/${ev.id}/export`;
  // Setup is the default tab, so the page itself is where settings are (D236).
  const base = { name: a.name, pageHref: href, settingsHref: href };

  if (a.kind === "booking") {
    const booked = facts.sessions.reduce((sum, s) => sum + s.booked, 0);
    return {
      activity: a, href,
      view: bookingRow({
        days: facts.sessions.map((s) => s.day), sessions: facts.sessions.length, booked,
        seats: facts.sessions.reduce((sum, s) => sum + s.capacity, 0), pending: facts.pending,
      }),
      toggle: toggleOpenAction.bind(null, ev.id, a.id, "list"),
      menu: {
        ...base, exportHref: `${exports}/activities.xlsx`,
        remove: deleteActivityAction.bind(null, ev.id, a.id),
        removeMessage: removeWarning({ kind: "booking", sessions: facts.sessions.length, bookings: booked }),
      },
    };
  }

  if (a.kind === "submission") {
    return {
      activity: a, href,
      view: submissionRow({ form: a, submitters: new Set(facts.submissions).size, eligible: facts.audience }),
      toggle: toggleOpenAction.bind(null, ev.id, a.id, "list"),
      menu: {
        ...base, exportHref: `${exports}/submissions.xlsx`,
        remove: deleteSubmissionActivityAction.bind(null, ev.id, a.id),
        removeMessage: removeWarning({ kind: "submission", submissions: facts.submissions.length }),
      },
    };
  }

  return {
    activity: a, href,
    view: passportRow({ ...facts.passport, eligible: facts.audience, open: a.is_open }),
    toggle: toggleOpenAction.bind(null, ev.id, a.id, "list"),
    menu: {
      ...base, exportHref: `${exports}/passport.xlsx`,
      remove: deletePassportActivityAction.bind(null, ev.id, a.id),
      removeMessage: removeWarning({ kind: "passport", booths: facts.passport.booths }),
    },
  };
}
