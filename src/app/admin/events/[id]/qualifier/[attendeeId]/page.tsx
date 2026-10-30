import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { getAttendee } from "@/lib/db/attendees";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { eventFeatures, has, NotInEvent } from "@/features/catalogue";
import { tagsFor } from "@/features/games/client";
import { getSettings, listRuns, RunsTable } from "@/features/qualifier";
import { setRunDisqualifiedAction } from "../actions";

export const metadata = { title: "Typing qualifier runs" };

/** One attendee's runs, newest first, with Disqualify / Restore on each finished run (D775). */
export default async function QualifierRuns({ params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const { id, attendeeId } = await params;
  const { actor, ev } = await requireEventAccess(id);
  const back = `/admin/events/${ev.id}/qualifier`;
  if (!has(await eventFeatures(ev.id), "typing_qualifier")) {
    return <NotInEvent eventId={ev.id} title="Typing qualifier" keys={["typing_qualifier"]} back={back} canTurnOn={actor.kind === "admin"} />;
  }
  // Only this event's people: any other id is a 404, never a peek at another event.
  const person = await getAttendee(attendeeId);
  if (!person || person.event_id !== ev.id) notFound();

  const [settings, runs] = await Promise.all([getSettings(ev.id), listRuns(ev.id, person.id)]);
  const label = tagsFor([person]).get(person.id)?.label ?? person.name;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={label}
        subtitle={label === person.name ? "Typing qualifier runs, newest first" : `${person.name} · typing qualifier runs, newest first`}
        actions={<Link href={back} className={buttonVariants({ variant: "outline" })}>Back to the board</Link>}
      />
      {settings?.confirmed_at && <p className="text-sm text-muted-foreground">The finalists are confirmed, so runs can no longer be disqualified or restored.</p>}
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <RunsTable
            runs={runs}
            locked={!!settings?.confirmed_at}
            actionFor={(r) => setRunDisqualifiedAction.bind(null, ev.id, person.id, r.id, r.disqualified_at === null)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
