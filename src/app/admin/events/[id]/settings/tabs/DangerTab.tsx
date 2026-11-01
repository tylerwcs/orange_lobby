import { deleteBlockedBecause } from "@/lib/event-delete";
import type { Event } from "@/lib/types";
import { Field } from "@/components/admin/Field";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteEventAction, purgeEventAction } from "../../actions";

/**
 * Always there, since Delete is for any event that is not live; Purge still needs the event
 * archived first. `total` is the attendee count the delete warning names.
 */
export function DangerTab({ ev, total }: { ev: Event; total: number }) {
  const deleteBlocked = deleteBlockedBecause(ev.status);
  return (
    <>
      {ev.status === "archived" && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Purge personal data</CardTitle>
            <CardDescription>
              Replaces names, emails, seats, phones, companies and every registration answer across this event, and reissues every personal link so the old ones stop working. Every form submission goes too, including any files attendees uploaded. Polaroid wall photos go too, with their messages. Attendance counts and categories are kept. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={purgeEventAction.bind(null, ev.id)}>
              <ConfirmButton message="Purge all attendee personal data for this event? This cannot be undone." className="text-destructive">Purge</ConfirmButton>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete this event</CardTitle>
          <CardDescription>
            Removes the event and everything in it: {total} attendee{total === 1 ? "" : "s"}, their check-ins, bookings and submissions, the agenda, activities, announcements, messages sent and every uploaded file. Every link to it stops working. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deleteBlocked ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{ev.name} cannot be deleted. {deleteBlocked}</p>
          ) : (
            <form action={deleteEventAction.bind(null, ev.id)} className="grid max-w-md gap-3">
              <Field label={`Type “${ev.name}” to confirm`} name="confirm_name" placeholder={ev.name} />
              <ConfirmButton message={`Delete ${ev.name} and everything in it? This cannot be undone.`} confirmLabel="Yes, delete the event" className="w-fit text-destructive">
                Delete event
              </ConfirmButton>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
