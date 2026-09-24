import Link from "next/link";
import { CalendarClock, CircleAlert, FileText, Stamp } from "lucide-react";
import type { Activity } from "@/lib/types";
import type { ActivityRowView } from "@/lib/activity-row";
import { MAX_SUBMISSION_QUESTIONS } from "@/lib/submissions";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import { meterPercent } from "@/lib/meter";
import { Field } from "@/components/admin/Field";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { ImageField } from "@/components/admin/ImageField";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { ActivityMenu, type ActivityMenuProps } from "@/components/admin/ActivityMenu";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

/** The hint under every activity's image field, every kind. */
export const COVER_HINT = "Best at 1600 × 800 px (2:1), JPEG or WebP under 500 KB. The card crops it to a 2:1 strip and the page shows it whole, so at 2:1 nothing is cut off.";

/**
 * The fields the add-submission form and its own edit form share. `readSubmissionPolicy` in
 * `../actions` reads them back; `is_open` is deliberately not here — see that file's note.
 * Exported so the "New activity" form and the Settings card on the submission's own page
 * render the identical fields rather than two copies that could drift.
 */
export function SubmissionFields({ activity }: { activity?: Activity }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={activity?.name} placeholder="Feedback" />
      <RichTextEditor name="description" label="Description (optional)" defaultValue={activity?.description} description={SECTIONS_HINT} />
      <ImageField
        label="Image (optional)"
        name="image"
        url={activity?.image_url}
        description={COVER_HINT}
      />
      {/* When and where: a booking's come from its sessions, a submission has none, so it says
          them here. Shown on the card and the page the way a booking's are. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date (optional)" name="starts_on" type="date" defaultValue={activity?.starts_on} />
        <Field label="End date (optional)" name="ends_on" type="date" defaultValue={activity?.ends_on} description="Leave blank for a single day." />
      </div>
      <Field label="Venue (optional)" name="venue" defaultValue={activity?.venue} placeholder="Level 3 gym" />
      <Field label="Button wording (optional)" name="action_label" defaultValue={activity?.action_label} placeholder="Submit"
        description="What the button on the attendee's page says, like Join now or Upload results. Leave blank for Submit." />
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


const KIND_ICONS: Record<Activity["kind"], typeof Stamp> = { booking: CalendarClock, submission: FileText, passport: Stamp };

/** The activity's picture at thumbnail size, or its kind's icon on the brand tint when it has none. */
export function ActivityThumb({ activity }: { activity: Pick<Activity, "kind" | "image_url"> }) {
  if (activity.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={activity.image_url} alt="" className="size-11 shrink-0 rounded-lg bg-muted object-cover" />;
  }
  const Icon = KIND_ICONS[activity.kind];
  return (
    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-5" />
    </span>
  );
}

export function StatusPill({ open }: { open: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${open ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground"}`}>
      {open ? "Open" : "Closed"}
    </span>
  );
}

export function AttentionBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
      <CircleAlert aria-hidden className="size-3.5" />{text}
    </span>
  );
}

export type ActivityListItem = {
  activity: Activity;
  view: ActivityRowView;
  href: string;
  toggle: () => Promise<void>;
  menu: ActivityMenuProps;
};

const ROW = "grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-4 px-4 md:grid-cols-[2.75rem_minmax(0,1fr)_5.5rem_11rem_5.5rem]";

/**
 * The activity list: one row per activity, every kind the same shape (D179) — picture, name and
 * kind, status, progress, and the same two controls, the Open switch and the menu. Before, each
 * kind had grown its own row: a booking's switch was on its page, a submission's Close, Edit and
 * Delete sat inline, a passport had none, and each said "open" in its own words. The organiser
 * reads this page mid-event to see what is running and what needs them, so every row answers
 * that in the same place.
 *
 * The whole row is the link to the activity's page (a stretched link under the name); the
 * controls sit above it so a click on them is theirs. On a phone the status and progress fold
 * under the name.
 */
export function ActivityList({ items }: { items: ActivityListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Add an activity to let attendees book a seat, send you something, or collect booth stamps.
      </p>
    );
  }
  return (
    <div role="table" aria-label="Activities">
      <div role="row" className={`${ROW} hidden border-b py-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground md:grid`}>
        {/* A real cell, not sr-only: sr-only is absolutely positioned and would drop out of the
            grid, sliding every heading one column left. */}
        <span role="columnheader" aria-label="Picture" />
        <span role="columnheader">Activity</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Progress</span>
        <span role="columnheader">Open</span>
      </div>
      {items.map((item) => <Row key={item.activity.id} {...item} />)}
    </div>
  );
}

function Row({ activity, view, href, toggle, menu }: ActivityListItem) {
  const pct = Math.round(meterPercent(view.progress.done, view.progress.total));
  return (
    <div role="row" className={`${ROW} relative border-b py-3 transition-colors last:border-b-0 hover:bg-muted/40`}>
      <ActivityThumb activity={activity} />
      <div role="cell" className="flex min-w-0 flex-col gap-1">
        <Link href={href} className="truncate font-bold outline-none after:absolute after:inset-0 focus-visible:underline">
          {activity.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-bold">{view.kind}</span>
          {view.detail && <span className="truncate">{view.detail}</span>}
          {view.attention && <AttentionBadge text={view.attention} />}
        </div>
        {/* Phone only: status and progress fold under the name. */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
          <StatusPill open={activity.is_open} />
          <span className="tabular-nums">{view.progress.label}</span>
        </div>
      </div>
      <div role="cell" className="hidden md:block"><StatusPill open={activity.is_open} /></div>
      <div role="cell" className="hidden flex-col gap-1.5 md:flex">
        <span className="text-sm tabular-nums">{view.progress.label}</span>
        <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
        </span>
      </div>
      <div role="cell" className="relative z-10 flex items-center justify-end gap-2 md:justify-start">
        <OpenSwitch open={activity.is_open} action={toggle} name={activity.name} />
        <ActivityMenu {...menu} />
      </div>
    </div>
  );
}
