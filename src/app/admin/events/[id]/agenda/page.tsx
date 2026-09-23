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
import { deleteAgendaItemAction, deleteBreakoutRoundAction, updateAgendaBannerAction } from "../actions";
import { ImageField } from "@/components/admin/ImageField";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { SessionForm, BreakoutForm } from "@/components/admin/AgendaForms";
import { agendaAccentClass } from "@/lib/agenda-colours";
import { breakoutSlots, rosters, agendaRows } from "@/lib/breakouts";
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
  // Counts per room and per round, read straight onto the agenda rows. There is no
  // separate roster block any more: a breakout listed in a stats card AND again in the
  // programme was the same thing twice, and the programme is where an organiser is already
  // looking.
  const roster = slots.length > 0 ? rosters(items, attendees.map((a) => a.id), assignments) : [];
  // Nested rather than a joined string key: a round called "A" with a room "B C" and a
  // round "A B" with a room "C" would build the same flat key, and a count landing on the
  // wrong room is the kind of wrong that looks right.
  const inRoom = new Map<string, Map<string, number>>();
  const noRoom = new Map<string, number>();
  for (const s of roster) {
    noRoom.set(s.slot, s.unassignedIds.length);
    inRoom.set(s.slot, new Map(s.rooms.map((r) => [r.code, r.attendeeIds.length])));
  }

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
            title="Add a breakout round"
            hint="A round and all of its rooms at once. An attendee sees only the room they are assigned to."
            trigger="Add breakout round"
            icon="users"
            variant="outline"
          >
            <BreakoutForm eventId={ev.id} startsOn={ev.starts_on} />
          </Modal>
          {/* The image belongs to the page, not to any session on it, so it lives beside
              the two "add" buttons rather than inside either form (D160). */}
          <Modal title="Agenda image" hint="One image above the agenda, on every day of the event." trigger="Image" icon="file" variant="outline">
            <form action={updateAgendaBannerAction.bind(null, ev.id)} className="grid gap-4 p-1">
              <ImageField
                label="Image"
                name="agenda_banner"
                url={ev.agenda_banner_url}
                description="Shown above the portal agenda at its own size, never cropped. Wider than the page, it is scaled down to fit."
              />
              <SubmitButton>Save image</SubmitButton>
            </form>
          </Modal>
        </div>
      </div>

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
              {agendaRows(d.items).map((row) => {
                const lead = row.kind === "round" ? row.items[0] : row.item;
                const accent = agendaAccentClass(lead.color);
                return (
                  <li key={row.kind === "round" ? row.slot : row.item.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 gap-4">
                      <div className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {lead.starts_at}{lead.ends_at ? ` – ${lead.ends_at}` : ""}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {accent && <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${accent}`} />}
                          <span className="font-bold">{row.kind === "round" ? row.slot : row.item.title}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.kind === "round"
                            ? [lead.title !== row.slot ? lead.title : null, lead.description].filter(Boolean).join(" · ")
                            : [row.item.location, row.item.description].filter(Boolean).join(" · ")}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {/* Every room of the round on one line — the thing the round is
                              actually for, and the counts that say how it is filling up. */}
                          {row.kind === "round" && row.items.map((r) => (
                            <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                              <span className="font-bold">{r.code || "no code"}</span>
                              <span className="tabular-nums text-muted-foreground">{inRoom.get(row.slot)?.get(r.code ?? "") ?? 0}</span>
                            </span>
                          ))}
                          {row.kind === "round" && (noRoom.get(row.slot) ?? 0) > 0 && (
                            <Badge variant="secondary" className="tabular-nums">{noRoom.get(row.slot)} with no room</Badge>
                          )}
                          {row.kind === "session" && row.item.categories && row.item.categories.length > 0 && (
                            <Badge variant="secondary">{row.item.categories.join(", ")}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {row.kind === "round" ? (
                        <>
                          <Modal title={`Edit ${row.slot}`} trigger="Edit" variant="ghost">
                            <BreakoutForm eventId={ev.id} round={{ slot: row.slot, items: row.items }} />
                          </Modal>
                          <form action={deleteBreakoutRoundAction.bind(null, ev.id, row.slot)}>
                            <ConfirmButton message={`Delete “${row.slot}” and its ${row.items.length} room${row.items.length === 1 ? "" : "s"}? Anyone assigned to them loses their room.`}>Delete</ConfirmButton>
                          </form>
                        </>
                      ) : (
                        <>
                          <Modal title="Edit session" trigger="Edit" variant="ghost">
                            <SessionForm eventId={ev.id} categories={categories} item={row.item} />
                          </Modal>
                          <form action={deleteAgendaItemAction.bind(null, ev.id, row.item.id)}>
                            <ConfirmButton message={`Delete "${row.item.title}"?`}>Delete</ConfirmButton>
                          </form>
                        </>
                      )}
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
