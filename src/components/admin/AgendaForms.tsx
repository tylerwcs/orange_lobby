import { useId } from "react";
import { Field } from "@/components/admin/Field";
import { Field as UIField, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CategoryCombo, ColourCombo } from "@/components/admin/AgendaCombos";
import { ImageField } from "@/components/admin/ImageField";
import {
  addAgendaItemAction, addBreakoutRoundAction, updateAgendaItemAction, updateBreakoutRoundAction,
  addAgendaImageAction, updateAgendaImageAction, addAgendaDayAction, updateAgendaDayAction,
} from "@/app/admin/events/[id]/actions";
import { dayLabel } from "@/lib/agenda";
import type { AgendaDay, AgendaItem } from "@/lib/types";

const control = "min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm";

/**
 * The agenda's forms, each doing double duty for adding and editing.
 *
 * One form per shape rather than one form with switches: an ordinary session has a location
 * and an audience, a breakout room has a round and a room code, an image row has a picture
 * and no time, and a day has only a date and a name. `item`/`round`/`day` present means
 * editing, and every field is seeded from the row, so an edit that touches one field leaves
 * the rest exactly as they were.
 *
 * Adding happens from inside a day's card, so the day is already decided and travels as a
 * hidden `day_id`; only an edit offers a day picker, because only an edit can move a row.
 */

export function DayForm({ eventId, day, suggestedDate }: { eventId: string; day?: AgendaDay; suggestedDate?: string | null }) {
  const action = day ? updateAgendaDayAction.bind(null, eventId, day.id) : addAgendaDayAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <Field label="Date" name="date" type="date" defaultValue={day?.date ?? suggestedDate} />
      <Field
        label="Name (optional)"
        name="name"
        defaultValue={day?.name}
        placeholder="Day 1 (Conference)"
        description="Shown on the portal's day tab, above the date. Left blank, the tab shows the date alone."
      />
      {day && (
        <p className="text-xs text-muted-foreground">
          A new date moves every session on this day with it. Activity bookings are dated separately and stay where they are.
        </p>
      )}
      <SubmitButton>{day ? "Save day" : "Add day"}</SubmitButton>
    </form>
  );
}

export function SessionForm({ eventId, categories, days, dayId, item }: {
  eventId: string;
  categories: string[];
  days: AgendaDay[];
  dayId: string;
  item?: AgendaItem;
}) {
  const action = item
    ? updateAgendaItemAction.bind(null, eventId, item.id)
    : addAgendaItemAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="session" />
      <When days={days} dayId={dayId} item={item} />
      <Field label="Title" name="title" defaultValue={item?.title} />
      <Field label="Location" name="location" defaultValue={item?.location} placeholder="Grand Ballroom" />
      <Field label="Description" name="description" textarea defaultValue={item?.description} />
      <CategoryCombo categories={categories} defaultValue={item?.categories ?? []} />
      <ColourCombo defaultValue={item?.color ?? null} />
      {/* Only the session form carries one. A breakout round is many rooms on a single
          form, so a picker there would set one picture for all of them (D160). */}
      <ImageField
        label="Image"
        name="image"
        url={item?.image_url}
        description="A speaker, a poster, the room. Shown as a thumbnail on the agenda, full size when tapped."
      />
      <SubmitButton>{item ? "Save session" : "Add session"}</SubmitButton>
    </form>
  );
}

export function BreakoutForm({ eventId, days, dayId, round }: {
  eventId: string;
  days: AgendaDay[];
  dayId: string;
  /** The round being edited, with every room in it. Absent means creating a new one. */
  round?: { slot: string; items: AgendaItem[] };
}) {
  const first = round?.items[0];
  const action = round
    ? updateBreakoutRoundAction.bind(null, eventId, round.slot)
    : addBreakoutRoundAction.bind(null, eventId);
  const codes = round?.items.map((i) => i.code).filter(Boolean).join(", ");
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="breakout" />
      <When days={days} dayId={dayId} item={first} />
      <Field
        label="Round"
        name="slot"
        defaultValue={round?.slot}
        placeholder="Breakout 1"
        description="Every room of this round shares it. Name it the same as the column in the spreadsheet."
      />
      <Field
        label="Rooms"
        name="code"
        defaultValue={codes}
        placeholder="3A, 3B, 3C, 3D"
        description="One per room, separated by commas, exactly as the spreadsheet writes them."
      />
      <Field label="Title (optional)" name="title" defaultValue={first?.title} placeholder="Breakout: regional teams" />
      <Field label="Description" name="description" textarea defaultValue={first?.description} />
      <ColourCombo defaultValue={first?.color ?? null} />
      {round && (
        <>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" name="remove_missing" className="mt-0.5 size-4 accent-primary" />
            <span>
              Remove rooms I have taken off the list
              <span className="block text-xs font-normal text-muted-foreground">
                Off by default. A room removed here is deleted, and so is everybody assigned to it.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Renaming the round moves everybody in it with it — every room at once, so the round
            cannot be split in half.
          </p>
        </>
      )}
      <SubmitButton>{round ? "Save round" : "Add round"}</SubmitButton>
    </form>
  );
}

/** An image placed in the day (D196): a picture, an optional caption and audience, no time. */
export function ImageItemForm({ eventId, categories, days, dayId, item }: {
  eventId: string;
  categories: string[];
  days: AgendaDay[];
  dayId: string;
  item?: AgendaItem;
}) {
  const action = item
    ? updateAgendaImageAction.bind(null, eventId, item.id)
    : addAgendaImageAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <DayPicker days={days} dayId={dayId} editing={Boolean(item)} />
      <ImageField
        label="Image"
        name="image"
        url={item?.image_url}
        description="Shown whole across the portal agenda, at the place you drag it to. Tapped, it opens full size."
      />
      <Field label="Caption (optional)" name="title" defaultValue={item?.title || null} placeholder="Venue map" />
      <CategoryCombo categories={categories} defaultValue={item?.categories ?? []} />
      <SubmitButton>{item ? "Save image" : "Add image"}</SubmitButton>
    </form>
  );
}

/** Day and times, the fields both timed shapes share. */
function When({ days, dayId, item }: { days: AgendaDay[]; dayId: string; item?: AgendaItem }) {
  return (
    <>
      <DayPicker days={days} dayId={dayId} editing={Boolean(item)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" name="starts_at" type="time" defaultValue={item?.starts_at} />
        <Field label="Ends" name="ends_at" type="time" defaultValue={item?.ends_at} />
      </div>
    </>
  );
}

function DayPicker({ days, dayId, editing }: { days: AgendaDay[]; dayId: string; editing: boolean }) {
  const id = useId();
  if (!editing) return <input type="hidden" name="day_id" value={dayId} />;
  return (
    <UIField>
      <FieldLabel htmlFor={id}>Day</FieldLabel>
      <select id={id} name="day_id" defaultValue={dayId} className={control}>
        {days.map((d) => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
      </select>
      <FieldDescription>Moved to another day, it goes in there by its start time.</FieldDescription>
    </UIField>
  );
}
