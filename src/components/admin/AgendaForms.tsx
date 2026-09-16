import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CategoryCombo, ColourCombo } from "@/components/admin/AgendaCombos";
import { addAgendaItemAction, addBreakoutRoundAction, updateAgendaItemAction, updateBreakoutRoundAction } from "@/app/admin/events/[id]/actions";
import type { AgendaItem } from "@/lib/types";

/**
 * The agenda's two forms, each doing double duty for adding and editing.
 *
 * One form per shape rather than one form with switches: an ordinary session has a location
 * and an audience, a breakout room has a round and a room code, and nothing has both. They
 * share the fields that are genuinely common — when it happens, what it is called, what
 * colour it carries.
 *
 * `item` present means editing. The action changes with it, and every field is seeded from
 * the row, so an edit that touches one field leaves the rest exactly as they were.
 */

export function SessionForm({ eventId, categories, item, startsOn }: {
  eventId: string;
  categories: string[];
  item?: AgendaItem;
  startsOn?: string | null;
}) {
  const action = item
    ? updateAgendaItemAction.bind(null, eventId, item.id)
    : addAgendaItemAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="session" />
      <When item={item} startsOn={startsOn} />
      <Field label="Title" name="title" defaultValue={item?.title} />
      <Field label="Location" name="location" defaultValue={item?.location} placeholder="Grand Ballroom" />
      <Field label="Description" name="description" textarea defaultValue={item?.description} />
      <CategoryCombo categories={categories} defaultValue={item?.categories ?? []} />
      <ColourCombo defaultValue={item?.color ?? null} />
      <SubmitButton>{item ? "Save session" : "Add session"}</SubmitButton>
    </form>
  );
}

export function BreakoutForm({ eventId, round, startsOn }: {
  eventId: string;
  /** The round being edited, with every room in it. Absent means creating a new one. */
  round?: { slot: string; items: AgendaItem[] };
  startsOn?: string | null;
}) {
  const first = round?.items[0];
  const action = round
    ? updateBreakoutRoundAction.bind(null, eventId, round.slot)
    : addBreakoutRoundAction.bind(null, eventId);
  const codes = round?.items.map((i) => i.code).filter(Boolean).join(", ");
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="breakout" />
      <When item={first} startsOn={startsOn} />
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

/** Day and times, the three fields both shapes share. */
function When({ item, startsOn }: { item?: AgendaItem; startsOn?: string | null }) {
  return (
    <>
      <Field label="Day" name="day" type="date" defaultValue={item?.day ?? startsOn} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" name="starts_at" type="time" defaultValue={item?.starts_at} />
        <Field label="Ends" name="ends_at" type="time" defaultValue={item?.ends_at} />
      </div>
    </>
  );
}
