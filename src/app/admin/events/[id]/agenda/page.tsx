import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { listAttendees, listCategories } from "@/lib/db/attendees";
import { listAssignments } from "@/lib/db/breakouts";
import { dayLabel, nextFreeDate } from "@/lib/agenda";
import { eventDays, nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { deleteAgendaDayAction, deleteAgendaItemAction, deleteBreakoutRoundAction, reorderAgendaDayAction, saveSectionIconAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { SectionIconForm } from "@/components/admin/SectionIconForm";
import { sectionIcons } from "@/lib/launcher";
import { SortableList } from "@/components/admin/SortableList";
import { RowActions } from "@/components/admin/RowActions";
import { DayTabs } from "@/components/admin/DayTabs";
import { DayForm, SessionForm, BreakoutForm, ImageItemForm } from "@/components/admin/AgendaForms";
import { agendaAccentClass } from "@/lib/agenda-colours";
import { breakoutSlots, rosters, agendaRows, type AgendaRow } from "@/lib/breakouts";
import { rowKey } from "@/lib/agenda-placement";
import type { AgendaDay, Attendee, BreakoutAssignment } from "@/lib/types";

export const metadata = { title: "Agenda" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function AgendaAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string }> }) {
  const { id } = await params;
  const { day: requestedDay } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [items, days, categories] = await Promise.all([listAgenda(ev.id), listAgendaDays(ev.id), listCategories(ev.id)]);
  const slots = breakoutSlots(items);
  // Only fetched when the event actually runs breakout rounds — a non-breakout event must
  // issue exactly the queries it issued before this feature.
  const [attendees, assignments]: [Attendee[], BreakoutAssignment[]] = slots.length > 0
    ? await Promise.all([listAttendees(ev.id), listAssignments(ev.id)])
    : [[], []];
  // Counts per room and per round, read straight onto the agenda rows. Nested rather than a
  // joined string key: a round "A" with a room "B C" and a round "A B" with a room "C" would
  // build the same flat key, and a count landing on the wrong room looks right.
  const roster = slots.length > 0 ? rosters(items, attendees.map((a) => a.id), assignments) : [];
  const inRoom = new Map<string, Map<string, number>>();
  const noRoom = new Map<string, number>();
  for (const s of roster) {
    noRoom.set(s.slot, s.unassignedIds.length);
    inRoom.set(s.slot, new Map(s.rooms.map((r) => [r.code, r.attendeeIds.length])));
  }
  const byDay = new Map(days.map((d) => [d.id, agendaRows(items.filter((i) => i.day_id === d.id))]));
  const sessions = [...byDay.values()].flat().filter((r) => r.kind === "round" || r.item.kind === "session").length;
  // The day `?day=` names (a reload, or the one Add day just made), else today's during the
  // event, else the first.
  const today = nowInKL().date;
  const initialDay = (days.find((d) => d.id === requestedDay) ?? days.find((d) => d.date === today) ?? days[0])?.id;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Agenda"
        subtitle={`${plural(days.length, "day")} · ${plural(sessions, "session")}`}
        actions={
          <>
            <Modal title="Agenda icon" hint="The round button attendees tap on the portal home." trigger="Agenda section settings" icon="settings" iconOnly>
              <SectionIconForm action={saveSectionIconAction.bind(null, ev.id, "agenda")} section="agenda" current={sectionIcons(ev.section_icons).agenda} />
            </Modal>
            <Modal title="Add a day" hint="Name it for the portal's tab — “Day 1 (Conference)”. Sessions and images go under it." trigger="Add day" icon="plus" variant="default">
              <DayForm eventId={ev.id} suggestedDate={nextFreeDate(eventDays(ev.starts_on, ev.ends_on), days.map((d) => d.date)) ?? ev.starts_on} />
            </Modal>
          </>
        }
      />

      {days.length === 0 && (
        <Card>
          <CardContent>
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No days yet</EmptyTitle>
                <EmptyDescription>Add the first day above, then put its sessions and images under it. Each day is a tab on the portal.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      {/* One day at a time, as tabs (DayTabs), rather than every day stacked down the page. */}
      {initialDay && (
        <DayTabs
          key={days.map((d) => d.id).join(",")}
          initial={initialDay}
          days={days.map((d) => ({ id: d.id, label: d.name || shortDate(d.date), date: d.name ? shortDate(d.date) : "" }))}
          panels={Object.fromEntries(days.map((day) => [day.id, (
            <DayPanel key={day.id} day={day} rows={byDay.get(day.id) ?? []} eventId={ev.id} days={days} categories={categories} inRoom={inRoom} noRoom={noRoom} />
          )]))}
        />
      )}
    </div>
  );
}

/** One day's tab: its heading and Edit/Delete, its rows in drag order, and the ways to add to it. */
function DayPanel({ day, rows, eventId, days, categories, inRoom, noRoom }: {
  day: AgendaDay;
  rows: AgendaRow[];
  eventId: string;
  days: AgendaDay[];
  categories: string[];
  inRoom: Map<string, Map<string, number>>;
  noRoom: Map<string, number>;
}) {
  const hasRounds = rows.some((r) => r.kind === "round");
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {day.name ? <>{day.name} <span className="font-semibold text-muted-foreground">· {shortDate(day.date)}</span></> : shortDate(day.date)}
        </CardTitle>
        <RowActions
          name={dayLabel(day)}
          edit={{ title: "Edit day", form: <DayForm eventId={eventId} day={day} /> }}
          remove={{
            action: deleteAgendaDayAction.bind(null, eventId, day.id),
            message: `${rows.length ? `Its ${plural(rows.length, "row")} go with it.` : "It has nothing on it yet."}${hasRounds ? " Anyone assigned to its breakout rooms loses their room." : ""}`,
          }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SortableList
          rows={rows.map((row) => ({
            key: rowKey(row),
            label: labelOf(row),
            node: <RowView row={row} eventId={eventId} day={day} days={days} categories={categories} inRoom={inRoom} noRoom={noRoom} />,
          }))}
          reorder={reorderAgendaDayAction.bind(null, eventId, day.id)}
          empty="Nothing on this day yet."
        />
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Modal title="Add a session" hint="Anything on the programme that a whole category attends together." trigger="Add session" icon="plus">
            <SessionForm eventId={eventId} categories={categories} days={days} dayId={day.id} />
          </Modal>
          <Modal title="Add a breakout round" hint="A round and all of its rooms at once. An attendee sees only the room they are assigned to." trigger="Add breakout round" icon="users" variant="outline">
            <BreakoutForm eventId={eventId} days={days} dayId={day.id} />
          </Modal>
          <Modal title="Add an image" hint="A picture in the programme — a map, a poster. It goes to the end of the day; drag it into place." trigger="Add image" icon="file" variant="outline">
            <ImageItemForm eventId={eventId} categories={categories} days={days} dayId={day.id} />
          </Modal>
        </div>
      </CardContent>
    </Card>
  );
}

function labelOf(row: AgendaRow): string {
  if (row.kind === "round") return row.slot;
  return row.item.kind === "image" ? row.item.title || "Image" : row.item.title;
}

/** One row's content inside the drag list: what it is, and its Edit and Delete. */
function RowView({ row, eventId, day, days, categories, inRoom, noRoom }: {
  row: AgendaRow;
  eventId: string;
  day: AgendaDay;
  days: AgendaDay[];
  categories: string[];
  inRoom: Map<string, Map<string, number>>;
  noRoom: Map<string, number>;
}) {
  if (row.kind === "item" && row.item.kind === "image") {
    const i = row.item;
    return (
      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          {i.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.image_url} alt="" className="h-12 w-16 shrink-0 rounded-md border border-border object-cover" />
          )}
          <div className="min-w-0">
            <div className="font-bold">{i.title || "Image"}</div>
            <div className="text-xs text-muted-foreground">Image{i.categories?.length ? ` · for ${i.categories.join(", ")}` : ""}</div>
          </div>
        </div>
        <RowActions
          name={i.title ? `“${i.title}”` : "this image"}
          edit={{ title: "Edit image", form: <ImageItemForm eventId={eventId} categories={categories} days={days} dayId={day.id} item={i} /> }}
          remove={{ action: deleteAgendaItemAction.bind(null, eventId, i.id), message: "It comes off the programme straight away." }}
        />
      </div>
    );
  }

  const lead = row.kind === "round" ? row.items[0] : row.item;
  const accent = agendaAccentClass(lead.color);
  const starts = row.kind === "round" ? row.starts_at : lead.starts_at;
  const ends = row.kind === "round" ? row.ends_at : lead.ends_at;
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex min-w-0 gap-4">
        <div className="w-24 shrink-0 tabular-nums text-muted-foreground">{starts}{ends ? ` – ${ends}` : ""}</div>
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
            {/* Every room of the round on one line — the thing the round is actually for,
                and the counts that say how it is filling up. */}
            {row.kind === "round" && row.items.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                <span className="font-bold">{r.code || "no code"}</span>
                <span className="tabular-nums text-muted-foreground">{inRoom.get(row.slot)?.get(r.code ?? "") ?? 0}</span>
              </span>
            ))}
            {row.kind === "round" && (noRoom.get(row.slot) ?? 0) > 0 && (
              <Badge variant="secondary" className="tabular-nums">{noRoom.get(row.slot)} with no room</Badge>
            )}
            {row.kind === "item" && row.item.categories && row.item.categories.length > 0 && (
              <Badge variant="secondary">{row.item.categories.join(", ")}</Badge>
            )}
          </div>
        </div>
      </div>
      {row.kind === "round" ? (
        <RowActions
          name={`“${row.slot}”`}
          edit={{ title: `Edit ${row.slot}`, form: <BreakoutForm eventId={eventId} days={days} dayId={day.id} round={{ slot: row.slot, items: row.items }} /> }}
          remove={{ action: deleteBreakoutRoundAction.bind(null, eventId, row.slot), message: `Its ${plural(row.items.length, "room")} go with it, and anyone assigned to them loses their room.` }}
        />
      ) : (
        <RowActions
          name={`“${row.item.title}”`}
          edit={{ title: "Edit session", form: <SessionForm eventId={eventId} categories={categories} days={days} dayId={day.id} item={row.item} /> }}
          remove={{ action: deleteAgendaItemAction.bind(null, eventId, row.item.id), message: "It comes off the programme straight away." }}
        />
      )}
    </div>
  );
}
