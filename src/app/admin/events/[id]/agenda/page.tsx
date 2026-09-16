import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda } from "@/lib/db/agenda";
import { listAttendees, listCategories } from "@/lib/db/attendees";
import { listAssignments } from "@/lib/db/breakouts";
import { groupByDay } from "@/lib/agenda";
import { shortDate } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { addAgendaItemAction, addBreakoutRoomAction, deleteAgendaItemAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { CategoryCombo, ColourCombo } from "@/components/admin/AgendaCombos";
import { agendaInkClass } from "@/lib/agenda-colours";
import { breakoutSlots, rosters, isBreakout } from "@/lib/breakouts";
import type { Attendee, BreakoutAssignment } from "@/lib/types";

export const metadata = { title: "Agenda · Orange Lobby" };

export default async function AgendaAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [items, categories] = await Promise.all([listAgenda(ev.id), listCategories(ev.id)]);
  const days = groupByDay(items);
  const total = days.reduce((n, d) => n + d.items.length, 0);
  const slots = breakoutSlots(items);
  // Only fetched when the event actually runs breakout rounds — a non-breakout event must
  // issue exactly the queries it issued before this feature.
  const [attendees, assignments]: [Attendee[], BreakoutAssignment[]] = slots.length > 0
    ? await Promise.all([listAttendees(ev.id), listAssignments(ev.id)])
    : [[], []];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminHeader
          title="Agenda"
          subtitle={`${total} session${total === 1 ? "" : "s"} across ${days.length} day${days.length === 1 ? "" : "s"}`}
        />
        <div className="flex flex-wrap gap-2">
          <Modal title="Add a session" hint="Anything on the programme that a whole category attends together." trigger="Add session" icon="plus">
            <form action={addAgendaItemAction.bind(null, ev.id)} className="grid gap-4 p-1">
              <Field label="Day" name="day" type="date" defaultValue={ev.starts_on} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts" name="starts_at" type="time" />
                <Field label="Ends" name="ends_at" type="time" />
              </div>
              <Field label="Title" name="title" />
              <Field label="Location" name="location" placeholder="Grand Ballroom" />
              <Field label="Description" name="description" textarea />
              <CategoryCombo categories={categories} />
              <ColourCombo />
              <SubmitButton>Add session</SubmitButton>
            </form>
          </Modal>

          <Modal
            title="Add a breakout room"
            hint="One room of a round. An attendee sees only the room they are assigned to."
            trigger="Add breakout room"
            icon="users"
            variant="outline"
          >
            <form action={addBreakoutRoomAction.bind(null, ev.id)} className="grid gap-4 p-1">
              <Field label="Day" name="day" type="date" defaultValue={ev.starts_on} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts" name="starts_at" type="time" />
                <Field label="Ends" name="ends_at" type="time" />
              </div>
              <Field
                label="Round"
                name="slot"
                placeholder="Breakout 1"
                description="Every room of one round shares this. Name it the same as the column in the spreadsheet."
              />
              <Field
                label="Room"
                name="code"
                placeholder="3A"
                description="Exactly as the spreadsheet writes it. This is also what the attendee sees."
              />
              <Field label="Title (optional)" name="title" placeholder="Breakout: regional teams" />
              <Field label="Description" name="description" textarea />
              <ColourCombo />
              <SubmitButton>Add breakout room</SubmitButton>
            </form>
          </Modal>
        </div>
      </div>

      <div className="space-y-4">
        {slots.length > 0 && (
          <div className="space-y-3">
            {rosters(items, attendees.map((a) => a.id), assignments).map((s) => (
              <Card key={s.slot} className="gap-0 divide-y py-0">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="font-bold">{s.slot}</div>
                  {s.unassignedIds.length > 0
                    ? <Badge variant="secondary" className="tabular-nums">{s.unassignedIds.length} with no room</Badge>
                    : <Badge variant="success">Everyone placed</Badge>}
                </div>
                {s.rooms.map((r) => (
                  <div key={r.code} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div className="font-bold">{r.code || "no code"}</div>
                    <span className="font-bold tabular-nums">{r.attendeeIds.length}</span>
                  </div>
                ))}
                <p className="p-4 text-xs text-muted-foreground">
                  Rooms are assigned from the attendee list: select people there, then Edit.
                </p>
              </Card>
            ))}
          </div>
        )}

        {days.length === 0 && (
          <Card>
            <CardContent>
              <Empty className="border-0 bg-transparent">
                <EmptyHeader>
                  <EmptyTitle>No sessions yet</EmptyTitle>
                  <EmptyDescription>
                    Add the first one above; attendees see the agenda grouped by day, filtered by their category.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        )}

        {days.map((d) => (
          <Card key={d.day}>
            <CardHeader><CardTitle>{shortDate(d.day)}</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {d.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 gap-4">
                      <div className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {i.starts_at}{i.ends_at ? ` – ${i.ends_at}` : ""}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {agendaInkClass(i.color) && (
                            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${agendaInkClass(i.color)}`} />
                          )}
                          <span className="font-bold">{i.title}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{[i.location, i.description].filter(Boolean).join(" · ")}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isBreakout(i) && <Badge>{i.slot} · {i.code}</Badge>}
                          {i.categories && i.categories.length > 0 && <Badge variant="secondary">{i.categories.join(", ")}</Badge>}
                        </div>
                      </div>
                    </div>
                    <form action={deleteAgendaItemAction.bind(null, ev.id, i.id)}>
                      <ConfirmButton message={`Delete "${i.title}"?`}>Delete</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
