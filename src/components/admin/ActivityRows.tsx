import Link from "next/link";
import type { Activity } from "@/lib/types";
import { capSummary, MAX_SUBMISSION_QUESTIONS } from "@/lib/submissions";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { ImageField } from "@/components/admin/ImageField";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

/**
 * The fields the add-submission form and its own edit form share. `readSubmissionPolicy` in
 * `../actions` reads them back; `is_open` is deliberately not here — see that file's note.
 * Exported so the list's header ("New submission") and each submission row's own "Edit" modal
 * render the identical fields rather than two copies that could drift.
 */
export function SubmissionFields({ activity }: { activity?: Activity }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={activity?.name} placeholder="Feedback" />
      <Field label="Description (optional)" name="description" textarea defaultValue={activity?.description} placeholder="Tell us how today went." />
      <ImageField
        label="Image (optional)"
        name="image"
        url={activity?.image_url}
        description="A poster or the rules, shown above the form at its own size, never cropped."
      />
      <Field label="Categories (optional)" name="categories" defaultValue={activity?.categories?.join(", ")} placeholder="VIP, Management"
        description="Comma separated. Leave blank to offer it to everyone." />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="max_per_attendee" className="text-sm font-bold">Total submissions per person (optional)</label>
        <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={366}
          defaultValue={activity?.max_per_attendee ?? ""} placeholder="Unlimited" inputMode="numeric" className={`${input} tabular-nums`} />
      </div>
      <label className={check}>
        <input type="checkbox" name="per_day" defaultChecked={activity?.per_day ?? false} className="size-4" />
        At most one submission per day, on top of the total above
      </label>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-extrabold">Questions</h3>
        <QuestionEditor questions={activity?.questions ?? []} types={FORM_QUESTION_TYPES} max={MAX_SUBMISSION_QUESTIONS} />
      </div>
    </>
  );
}

/**
 * The activity list: one row per activity, whichever kind it is (D178) — this is the "ONE list
 * showing both kinds" the merge asked for, in `listActivities`' own order rather than one section
 * per kind. Follows BoothList's row shape (badges, tabular-nums counts).
 *
 * A booking row carries no reorder or delete controls here — those live on its own detail page
 * (Task 9), since this list's job is to get the organiser to the right activity, not to edit one
 * inline. A submission row is the opposite: it carries the same inline Open/Close, Edit and
 * Delete controls the old forms list did, because the merged detail page for a submission
 * activity (SubmissionTable, MissingPanel, ParticipationPanel, the export link) offers nowhere
 * else to reach them.
 */
export function ActivityRows({ items, counts, seats, pending, submissionCounts, basePath, toggleOpen, saveSubmission, deleteSubmission }: {
  items: Activity[];
  /** Bookings per activity id. */
  counts: Record<string, number>;
  /** Total capacity per activity id. */
  seats: Record<string, number>;
  /** Open requests per activity id. Absent, not zero, for an activity with nothing waiting. */
  pending: Record<string, number>;
  /** Submissions per activity id. */
  submissionCounts: Record<string, number>;
  basePath: string;
  toggleOpen: (activityId: string) => Promise<void>;
  saveSubmission: (activityId: string, fd: FormData) => Promise<void>;
  deleteSubmission: (activityId: string) => Promise<void>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activities yet. Add one to let attendees book a seat or send you something.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        if (a.kind === "booking") {
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`${basePath}/activities/${a.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                {a.name}
              </Link>
              <Badge variant="outline">Booking</Badge>
              {a.required && <Badge variant="secondary">Pick one</Badge>}
              <Badge variant={a.is_open ? "default" : "outline"}>
                {a.is_open ? "Booking open" : "Closed"}
              </Badge>
              {pending[a.id] ? <Badge variant="secondary">{pending[a.id]} waiting</Badge> : null}
              <span className="text-sm text-muted-foreground tabular-nums">
                {counts[a.id] ?? 0} / {seats[a.id] ?? 0} seats
              </span>
            </li>
          );
        }
        const used = submissionCounts[a.id] ?? 0;
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
            <Link href={`${basePath}/activities/${a.id}`} className="min-w-0 flex-1 font-medium hover:underline">
              {a.name}
            </Link>
            <Badge variant="outline">Submission</Badge>
            <Badge variant={a.is_open ? "default" : "outline"}>{a.is_open ? "Open" : "Closed"}</Badge>
            <Badge variant="secondary">{capSummary(a)}</Badge>
            <Link href={`${basePath}/activities/${a.id}`} className="text-sm text-muted-foreground tabular-nums hover:underline">
              {used} submission{used === 1 ? "" : "s"}
            </Link>
            <form action={toggleOpen.bind(null, a.id)}>
              <SubmitButton variant="outline">{a.is_open ? "Close" : "Open"}</SubmitButton>
            </form>
            <Modal title={`Edit ${a.name}`} trigger="Edit" variant="outline">
              <form action={saveSubmission.bind(null, a.id)} className="grid gap-4">
                <SubmissionFields activity={a} />
                <SubmitButton>Save</SubmitButton>
              </form>
            </Modal>
            <form action={deleteSubmission.bind(null, a.id)}>
              <ConfirmButton
                message={`Delete “${a.name}”? ${used > 0 ? `This takes ${used} submission${used === 1 ? "" : "s"} with it. ` : ""}This cannot be undone.`}
                className="text-destructive"
              >
                Delete
              </ConfirmButton>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
