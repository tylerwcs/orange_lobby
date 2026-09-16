import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda } from "@/lib/db/agenda";
import { groupByDay } from "@/lib/agenda";
import { shortDate } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { addAgendaItemAction, assignFromColumnAction, deleteAgendaItemAction } from "../actions";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { breakoutSlots } from "@/lib/breakouts";

export const metadata = { title: "Agenda · Orange Lobby" };

export default async function AgendaAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const items = await listAgenda(ev.id);
  const days = groupByDay(items);
  const total = days.reduce((n, d) => n + d.items.length, 0);
  const slots = breakoutSlots(items);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <AdminHeader title="Agenda" subtitle={`${total} session${total === 1 ? "" : "s"} across ${days.length} day${days.length === 1 ? "" : "s"}`} />
      </div>

      <div className="@container"><div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {slots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <Modal key={s.slot} title={`Assign from column: ${s.slot}`} hint={`Reads each attendee's "${s.slot}" column and matches it to a room code.`} trigger={`Assign ${s.slot}`} icon="users" variant="outline">
                  <form action={assignFromColumnAction.bind(null, ev.id)} className="grid gap-4">
                    <input type="hidden" name="slot" value={s.slot} />
                    <p className="text-sm text-muted-foreground">Rooms in this round: {s.items.map((i) => i.code).filter(Boolean).join(", ") || "none have a code yet"}.</p>
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input type="checkbox" name="overwrite" className="size-4 accent-primary" />
                      Overwrite people who already have a room
                    </label>
                    <SubmitButton>Assign from column</SubmitButton>
                  </form>
                </Modal>
              ))}
            </div>
          )}
          {days.length === 0 && (
            <Card>
              <CardContent>
                <Empty className="border-0 bg-transparent">
                  <EmptyHeader>
                    <EmptyTitle>No sessions yet</EmptyTitle>
                    <EmptyDescription>Add the first one on the right; attendees see the agenda grouped by day, filtered by their category.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          )}
          {days.map((d) => (
            <Card key={d.day}>
              <CardHeader>
                <CardTitle>{shortDate(d.day)}</CardTitle>
              </CardHeader>
              <CardContent>
              <ul className="divide-y text-sm">
                {d.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 gap-4">
                      <div className="w-24 shrink-0 tabular-nums text-muted-foreground">{i.starts_at}{i.ends_at ? ` – ${i.ends_at}` : ""}</div>
                      <div className="min-w-0">
                        <div className="font-bold">{i.title}</div>
                        <div className="text-xs text-muted-foreground">{[i.location, i.description].filter(Boolean).join(" · ")}</div>
                        {i.categories && i.categories.length > 0 && <div className="mt-1"><Badge variant="secondary">{i.categories.join(", ")}</Badge></div>}
                      </div>
                    </div>
                    <form action={deleteAgendaItemAction.bind(null, ev.id, i.id)}><ConfirmButton message={`Delete "${i.title}"?`}>Delete</ConfirmButton></form>
                  </li>
                ))}
              </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <form action={addAgendaItemAction.bind(null, ev.id)} className="grid gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 xl:sticky xl:top-6">
          <h2 className="text-base font-extrabold">Add a session</h2>
          <Field label="Day" name="day" type="date" defaultValue={ev.starts_on} />
          <div className="grid grid-cols-2 gap-3"><Field label="Starts" name="starts_at" type="time" /><Field label="Ends" name="ends_at" type="time" /></div>
          <Field label="Title" name="title" />
          <Field label="Location" name="location" placeholder="Grand Ballroom" />
          <Field label="Description" name="description" textarea />
          <Field label="Only for these categories" name="categories" placeholder="Blank = everyone. Otherwise: VIP, Speakers" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breakout round" name="slot" placeholder="Blank = ordinary session" description="Name it the same as the column in the client's spreadsheet." />
            <Field label="Room code" name="code" placeholder="3A" description="The value that column holds for this room." />
          </div>
          <Field label="Order among sessions at the same time (lower first)" name="sort_order" type="number" defaultValue="0" />
          <SubmitButton>Add session</SubmitButton>
        </form>
      </div>
      </div>
    </div>
  );
}
