import { requireEventAccess } from "@/lib/access";
import { listActivities } from "@/features/activities";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RowActions } from "@/components/admin/RowActions";
import { Modal } from "@/components/admin/Modal";
import { SortableList } from "@/components/admin/SortableList";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { Activity } from "@/lib/types";
import { listPopups } from "../db";
import type { PortalPopup } from "../types";
import { addPopupAction, deletePopupAction, reorderPopupsAction, setPopupOnAction, updatePopupAction } from "./actions";

const select = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The event's popups (D756), laid out like Announcements: "New" in the header, the list in one
 * card, a switch and a ⋯ menu per row. The order is the order they take turns in: an attendee
 * sees the first that applies to them (D754).
 */
export async function PopupsPage({ eventId }: { eventId: string }) {
  const { ev } = await requireEventAccess(eventId);
  const [popups, activities] = await Promise.all([listPopups(ev.id), listActivities(ev.id)]);
  const bookings = activities.filter((a) => a.kind === "booking");
  const names = new Map(activities.map((a) => [a.id, a.name]));

  const form = (p?: PortalPopup) => (
    <form action={p ? updatePopupAction.bind(null, ev.id, p.id) : addPopupAction.bind(null, ev.id)} className="grid gap-3 p-1">
      <Field label="Heading" name="heading" defaultValue={p?.heading} placeholder="Book your health screening" />
      <RichTextEditor name="message" label="Message" defaultValue={p?.message_html} minHeight={120}
        description="Shown exactly as typed. For two languages, write both." />
      <Field label="Button label" name="button_label" defaultValue={p?.button_label} placeholder="Book now"
        description="The button takes them to the activity's page." />
      <ActivitySelect bookings={bookings} defaultValue={p?.activity_id} />
      <SubmitButton>{p ? "Save" : "Create popup"}</SubmitButton>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Popups"
        subtitle="They pop up each time attendees open their portal, until they've done what it asks. Attendees see the first one that applies."
        actions={
          <Modal title="New popup" hint="It starts switched on. Attendees see it the next time they open the portal." trigger="New popup" icon="plus" variant="default">
            {bookings.length > 0 ? form() : <p className="p-1 text-sm text-muted-foreground">Add a booking activity first. A popup reminds attendees to book one.</p>}
          </Modal>
        }
      />

      <Card>
        <CardContent className="px-4">
          {popups.length === 0 ? (
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No popups yet</EmptyTitle>
                <EmptyDescription>A popup reminds attendees to do something each time they open their portal.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <SortableList
              rows={popups.map((p) => ({
                key: p.id,
                label: p.heading,
                node: (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-bold">{p.heading}</div>
                      <p className="mt-1 text-muted-foreground">Until they&apos;ve booked {names.get(p.activity_id) ?? "the activity"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <OpenSwitch open={p.is_on} action={setPopupOnAction.bind(null, ev.id, p.id, !p.is_on)} name={p.heading} verb="Show" states={["On", "Off"]} />
                      <RowActions
                        name={`“${p.heading}”`}
                        edit={{ title: "Edit popup", form: form(p) }}
                        remove={{ action: deletePopupAction.bind(null, ev.id, p.id), message: "Attendees stop seeing it straight away." }}
                      />
                    </div>
                  </div>
                ),
              }))}
              reorder={reorderPopupsAction.bind(null, ev.id)}
              empty="No popups yet."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Which activity it is about: shown until the attendee holds a booking in it (D752). */
function ActivitySelect({ bookings, defaultValue }: { bookings: Activity[]; defaultValue?: string }) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor="popup_activity">Show until they&apos;ve booked</label>
      <select id="popup_activity" name="activity_id" className={select} defaultValue={defaultValue ?? bookings[0]?.id ?? ""}>
        {bookings.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_open ? "" : " (closed)"}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">It shows only while they can still book: the activity is open and a slot that hasn&apos;t started has room.</p>
    </div>
  );
}
