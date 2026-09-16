import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CategoryCombo, ColourCombo } from "@/components/admin/AgendaCombos";
import { addAgendaItemAction, addBreakoutRoundAction, updateAgendaItemAction } from "@/app/admin/events/[id]/actions";
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

export function BreakoutForm({ eventId, item, startsOn }: { eventId: string; item?: AgendaItem; startsOn?: string | null }) {
  const action = item
    ? updateAgendaItemAction.bind(null, eventId, item.id)
    : addBreakoutRoundAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="breakout" />
      <When item={item} startsOn={startsOn} />
      <Field
        label="Round"
        name="slot"
        defaultValue={item?.slot}
        placeholder="Breakout 1"
        description="Every room of one round shares this. Name it the same as the column in the spreadsheet."
      />
      {/* Creating a round asks for all of its rooms at once — everything else on this form
          is shared between them. Editing is one room at a time, because that is the only
          field of a room that is its own. */}
      <Field
        label={item ? "Room" : "Rooms"}
        name="code"
        defaultValue={item?.code}
        placeholder={item ? "3A" : "3A, 3B, 3C, 3D"}
        description={item
          ? "Exactly as the spreadsheet writes it. This is also what the attendee sees."
          : "One per room, separated by commas, exactly as the spreadsheet writes them. Each becomes a room of this round."}
      />
      <Field label="Title (optional)" name="title" defaultValue={item?.title} placeholder="Breakout: regional teams" />
      <Field label="Description" name="description" textarea defaultValue={item?.description} />
      <ColourCombo defaultValue={item?.color ?? null} />
      {item && (
        <p className="text-xs text-muted-foreground">
          Renaming the round moves the people already in this room with it. Rename every room of the
          round, or you will have split it in two.
        </p>
      )}
      <SubmitButton>{item ? "Save room" : "Add round"}</SubmitButton>
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
