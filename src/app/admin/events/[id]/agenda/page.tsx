import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda } from "@/lib/db/agenda";
import { listAttendees, listCategories } from "@/lib/db/attendees";
import { listAssignments } from "@/lib/db/breakouts";
import { groupByDay } from "@/lib/agenda";
import { shortDate } from "@/lib/text";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { deleteAgendaItemAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { SessionForm, BreakoutForm } from "@/components/admin/AgendaForms";
import { agendaAccentClass } from "@/lib/agenda-colours";
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
  const roster = slots.length > 0 ? rosters(items, attendees.map((a) => a.id), assignments) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminHeader
          title="Agenda"
          subtitle={`${total} session${total === 1 ? "" : "s"} across ${days.length} day${days.length === 1 ? "" : "s"}`}
        />
        <div className="flex flex-wrap gap-2">
          <Modal title="Add a session" hint="Anything on the programme that a whole category attends together." trigger="Add session" icon="plus">
            <SessionForm eventId={ev.id} categories={categories} startsOn={ev.starts_on} />
          </Modal>
          <Modal
            title="Add a breakout room"
            hint="One room of a round. An attendee sees only the room they are assigned to."
            trigger="Add breakout room"
            icon="users"
            variant="outline"
          >
            <BreakoutForm eventId={ev.id} startsOn={ev.starts_on} />
          </Modal>
        </div>
      </div>

      {/* One line per round, not a card each. This is a glance — how full is each room, and
          how many people still have none — and it used to cost a third of the screen to say
          it. Where assignment happens is the attendee list, one click away; saying so here
          on every render was a sentence nobody needed twice. */}
      {roster.length > 0 && (
        <Card className="gap-0 divide-y py-0">
          {roster.map((s) => (
            <div key={s.slot} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
              <span className="font-bold">{s.slot}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {s.rooms.map((r) => (
                  <span key={r.code} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    <span className="font-bold">{r.code || "no code"}</span>
                    <span className="tabular-nums text-muted-foreground">{r.attendeeIds.length}</span>
                  </span>
                ))}
              </span>
              <span className="ml-auto">
                {s.unassignedIds.length > 0
                  ? <Badge variant="secondary" className="tabular-nums">{s.unassignedIds.length} with no room</Badge>
                  : <Badge variant="success">Everyone placed</Badge>}
              </span>
            </div>
          ))}
        </Card>
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
              {d.items.map((i) => {
                const accent = agendaAccentClass(i.color);
                return (
                  <li key={i.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 gap-4">
                      <div className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {i.starts_at}{i.ends_at ? ` – ${i.ends_at}` : ""}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {accent && <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${accent}`} />}
                          <span className="font-bold">{i.title}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{[i.location, i.description].filter(Boolean).join(" · ")}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isBreakout(i) && <Badge>{i.slot} · {i.code}</Badge>}
                          {i.categories && i.categories.length > 0 && <Badge variant="secondary">{i.categories.join(", ")}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Modal title={isBreakout(i) ? "Edit breakout room" : "Edit session"} trigger="Edit" variant="ghost">
                        {isBreakout(i)
                          ? <BreakoutForm eventId={ev.id} item={i} />
                          : <SessionForm eventId={ev.id} categories={categories} item={i} />}
                      </Modal>
                      <form action={deleteAgendaItemAction.bind(null, ev.id, i.id)}>
                        <ConfirmButton message={`Delete "${i.title}"?`}>Delete</ConfirmButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
