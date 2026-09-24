import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities, listSessions, countBookingsBySession, listSubmissions } from "@/lib/db/activities";
import { listBooths, listStampsForEvent } from "@/lib/db/booths";
import { passportRollup } from "@/lib/booths";
import { listRequests } from "@/lib/db/activity-requests";
import { pendingCountByActivity } from "@/lib/activity-requests";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ActivityRows, SubmissionFields } from "@/components/admin/ActivityRows";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { COVER_HINT } from "@/components/admin/ActivityRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addActivityAction, addSubmissionActivityAction, saveSubmissionActivityAction,
  deleteSubmissionActivityAction, toggleOpenAction, addPassportActivityAction,
} from "./actions";

export const metadata = { title: "Activities · Orange Lobby" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function Activities({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [activities, sessions, bookings, requests, submissions, booths, stamps] = await Promise.all([
    listActivities(ev.id), listSessions(ev.id), countBookingsBySession(ev.id), listRequests(ev.id), listSubmissions(ev.id),
    listBooths(ev.id), listStampsForEvent(ev.id),
  ]);

  // Rolled up from the sessions already loaded rather than queried per activity: the page
  // shows one line each, and a query per row is how a ten-activity event gets slow.
  const counts: Record<string, number> = {};
  const seats: Record<string, number> = {};
  for (const s of sessions) {
    counts[s.activity_id] = (counts[s.activity_id] ?? 0) + (bookings[s.id] ?? 0);
    seats[s.activity_id] = (seats[s.activity_id] ?? 0) + s.capacity;
  }
  const pending = pendingCountByActivity(requests);

  // Same rollup, for the other kind's count column — one query for every submission activity
  // on the page rather than one query per row.
  const submissionCounts = submissions.reduce<Record<string, number>>((acc, s) => {
    acc[s.activity_id] = (acc[s.activity_id] ?? 0) + 1;
    return acc;
  }, {});

  const passportCounts = passportRollup(activities.filter((a) => a.kind === "passport"), booths, stamps);

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Activities"
        subtitle="Attendees book these themselves, send you answers on their own schedule, or collect stamps at booths. Breakout rooms, which you assign from the agenda, are a separate thing."
        actions={
          <>
            <Modal title="Add a booking activity" hint="Add its sessions once it exists." trigger="New booking" icon="plus">
              <form action={addActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
                <Field label="Name" name="name" placeholder="Workshops" />
                <RichTextEditor name="description" label="Description (optional)" description={SECTIONS_HINT} />
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
            </Modal>
            <Modal title="Add a submission activity" hint="Add its questions now, or come back and edit them later." trigger="New submission" icon="plus">
              <form action={addSubmissionActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
                <SubmissionFields />
                <label className={check}>
                  <input type="checkbox" name="submissions_open" className="size-4" />
                  Open for submissions now
                </label>
                <SubmitButton>Add submission</SubmitButton>
              </form>
            </Modal>
            <Modal title="Add a booth passport" hint="Add its booths once it exists. Each booth gets a scanner link to print." trigger="New passport" icon="plus">
              <form action={addPassportActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
                <Field label="Name" name="name" defaultValue="Booth Passport" />
                <RichTextEditor name="description" label="Description (optional)" description={SECTIONS_HINT} />
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
            </Modal>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Activities</CardTitle></CardHeader>
        <CardContent className="px-6">
          <ActivityRows
            items={activities}
            counts={counts}
            seats={seats}
            pending={pending}
            submissionCounts={submissionCounts}
            passports={passportCounts}
            basePath={`/admin/events/${ev.id}`}
            toggleOpen={toggleOpenAction.bind(null, ev.id)}
            saveSubmission={saveSubmissionActivityAction.bind(null, ev.id)}
            deleteSubmission={deleteSubmissionActivityAction.bind(null, ev.id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
