import { activeCheckpoint, checkpointsByDay } from "@/lib/checkpoints";
import { eventDays, nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { crewLink } from "@/lib/links";
import { crewLinkLastDay } from "@/lib/crew";
import { eventFields } from "@/lib/attendee-fields";
import { MAX_SCAN_FIELDS } from "@/lib/scan";
import type { Activity, Event } from "@/lib/types";
import type { LoadedDoors } from "@/features/activities";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ShareLink } from "@/components/admin/ShareLink";
import { CheckpointList } from "@/components/admin/CheckpointList";
import { FieldPicker } from "@/components/admin/FieldPicker";
import { Modal } from "@/components/admin/Modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { addCheckpointAction, deleteCheckpointAction, reorderCheckpointsAction, rotateCrewTokenAction, setBadgeCheckinAction, setCheckInEnabledAction, setCheckpointSurveyAction, updateScanFieldsAction } from "../../actions";
import { SELECT_CLASS } from "./Section";

const CHECK_IN_CHOICES: { value: boolean; label: string; what: string }[] = [
  { value: true, label: "This event has check-in", what: "Crew scan attendees at the doors you set up below." },
  { value: false, label: "No check-in", what: "Nothing is scanned. Anything already recorded is kept, not deleted — switch back on and it returns." },
];

/**
 * The doors: the check-in switch, the badge pill, checkpoints with their surveys, the crew link
 * and the scan card. Every card here is its own small form, applied on its own.
 */
export function CheckInTab({ ev, cps, tallies, bookingActivities, forms, base }: {
  ev: Event;
  cps: LoadedDoors["cps"];
  tallies: LoadedDoors["tallies"];
  bookingActivities: Activity[];
  /** D761: the forms a door can offer crew after each check-in. */
  forms: Activity[];
  base: string;
}) {
  const activityNames = Object.fromEntries(bookingActivities.map((a) => [a.id, a.name]));
  const surveyNames = Object.fromEntries(forms.map((a) => [a.id, a.name]));
  const surveySelect = (current: string | null, id: string) => (
    <select id={id} name="survey_activity_id" className={SELECT_CLASS} defaultValue={current ?? ""}>
      <option value="">None</option>
      {forms.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
  const surveyHint = "Crew are offered this form on their device right after they scan someone in.";
  // D761: each door's own picker.
  const surveyForms = forms.length === 0 ? null : Object.fromEntries(cps.map((c) => [c.id, (
    <form key={c.id} action={setCheckpointSurveyAction.bind(null, ev.id, c.id)} className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor={`cp_survey_${c.id}`}>Form</label>
        {surveySelect(c.survey_activity_id, `cp_survey_${c.id}`)}
        <p className="text-xs text-muted-foreground">{surveyHint}</p>
      </div>
      <div><SubmitButton>Save</SubmitButton></div>
    </form>
  )]));
  const grouped = checkpointsByDay(cps);
  const running = activeCheckpoint(ev.active_checkpoint_id, cps, nowInKL().date);
  const days = eventDays(ev.starts_on, ev.ends_on);
  const crewExpiry = crewLinkLastDay(ev);
  const scanFields = eventFields(ev.registration_questions, ev.attendee_fields);

  return (
    <>
      {/* Above the checkpoint list because it governs it: an organiser who has just read
          "this event has no door" should not then be invited to add one. */}
      <Card>
        <CardHeader>
          <CardTitle>Check-in</CardTitle>
          <CardDescription>
            Some events have no door — a wellness fair people wander into, a programme that runs for weeks.
            Switching this off hides the Scanner, the arrival counts and the attendance export. Applies the
            moment you choose it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {CHECK_IN_CHOICES.map((c) => (
              <form key={String(c.value)} action={setCheckInEnabledAction.bind(null, ev.id, c.value)}>
                {/* SubmitButton for the same reason the status buttons use it. */}
                <SubmitButton
                  variant={ev.check_in_enabled === c.value ? "default" : "outline"}
                  aria-current={ev.check_in_enabled === c.value ? "true" : undefined}
                >
                  {c.label}
                </SubmitButton>
              </form>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {CHECK_IN_CHOICES.find((c) => c.value === ev.check_in_enabled)?.what}
          </p>
          {ev.check_in_enabled && (
            /* D388: its own form, like the door switch above, so it never re-saves anything else. */
            <form action={setBadgeCheckinAction.bind(null, ev.id)} className="flex flex-col gap-2 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
                  <input type="checkbox" name="badge_checkin" defaultChecked={ev.badge_checkin} className="size-4 accent-primary" /> Show check-in on the attendee&apos;s badge
                </label>
                <SubmitButton variant="outline">Save</SubmitButton>
              </div>
              <p className="text-xs text-muted-foreground">
                The badge on the portal home follows the checkpoint running now: &ldquo;Lunch · 12:05&rdquo; once they are scanned there, &ldquo;Not checked in to Lunch yet&rdquo; before.
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Checkpoints, the crew link and the scan card are all doors. With check-in off they
          are three cards configuring something that does not happen. */}
      {ev.check_in_enabled && (
      <>
      <Card>
        <CardHeader>
          <CardTitle>Checkpoints</CardTitle>
          <CardDescription>The doors this event runs. Which one is live is chosen on the Overview. A day can hold several — registration, lunch, a dinner door.</CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Modal title="New checkpoint" hint="A checkpoint is a moment on a date, so several can share one day." trigger="New checkpoint" icon="plus" iconOnly>
            <form action={addCheckpointAction.bind(null, ev.id)} className="grid gap-4 sm:grid-cols-2">
              {bookingActivities.length > 0 && (
                <div className="grid gap-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="cp_activity">Who&apos;s expected</label>
                  <select id="cp_activity" name="activity_id" className={SELECT_CLASS} defaultValue="">
                    <option value="">Everyone registered</option>
                    {bookingActivities.map((a) => <option key={a.id} value={a.id}>Booked for {a.name}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">A booking door lists who booked that day&apos;s sessions, and shows who didn&apos;t come.</p>
                </div>
              )}
              {forms.length > 0 && (
                <div className="grid gap-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="cp_survey">Survey after check-in</label>
                  {surveySelect(null, "cp_survey")}
                  <p className="text-xs text-muted-foreground">{surveyHint}</p>
                </div>
              )}
              <Field label="Name" name="name" placeholder="Registration"
                description={bookingActivities.length > 0 ? "For a booking door, leave blank to use the activity's name." : undefined} />
              <Field label="Date" name="day" type="date" defaultValue={days[0] ?? ev.starts_on} />
              <div className="sm:col-span-2"><SubmitButton>Add checkpoint</SubmitButton></div>
            </form>
          </Modal>
          </div>
        </CardHeader>
        <CardContent>
        {grouped.length === 0 ? (
          <Empty className="border-0 bg-transparent">
            <EmptyHeader>
              <EmptyTitle>No checkpoints yet</EmptyTitle>
              <EmptyDescription>Add &ldquo;Registration&rdquo; on the first morning to get started.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((g) => (
              <div key={g.day} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{shortDate(g.day)}</h3>
                <CheckpointList
                  day={shortDate(g.day)}
                  items={g.items}
                  tallies={tallies}
                  activityNames={activityNames}
                  surveyNames={surveyNames}
                  surveyForms={surveyForms}
                  activeId={running?.id ?? null}
                  reorder={reorderCheckpointsAction.bind(null, ev.id, g.day)}
                  deleteCheckpoint={deleteCheckpointAction.bind(null, ev.id)}
                />
              </div>
            ))}
          </div>
        )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crew link</CardTitle>
          <CardDescription>
            One shared link for everyone scanning at this event&apos;s doors. Anyone holding it can scan attendees in — and can see the full attendee list. Hand it out like a shared password, not a personal invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ev.crew_token ? (
            <>
              <ShareLink label="Crew" url={crewLink(base, ev.crew_token)} />
              <p className="text-xs tabular-nums text-muted-foreground">
                {crewExpiry ? `Stops working after ${shortDate(crewExpiry)}.` : "This link does not expire, because the event has no dates."}
              </p>
              <form action={rotateCrewTokenAction.bind(null, ev.id)}>
                <ConfirmButton message="Replace the crew link? The old one stops working immediately, and every copy already handed out will be turned away.">
                  Replace link
                </ConfirmButton>
              </form>
            </>
          ) : (
            <form action={rotateCrewTokenAction.bind(null, ev.id)}>
              <SubmitButton>Create crew link</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scan card fields</CardTitle>
          <CardDescription>After a scan, crew see the attendee&apos;s name and category, plus the fields chosen here — up to {MAX_SCAN_FIELDS}.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateScanFieldsAction.bind(null, ev.id)} className="flex flex-col items-start gap-3">
            <FieldPicker
              key={ev.scan_extra_fields.join("␟")}
              name="scan_extra_fields"
              fields={scanFields}
              selected={ev.scan_extra_fields}
              max={MAX_SCAN_FIELDS}
            />
            <SubmitButton>Save scan card</SubmitButton>
          </form>
        </CardContent>
      </Card>
      </>
      )}
    </>
  );
}
