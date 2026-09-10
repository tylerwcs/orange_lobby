import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda } from "@/lib/db/agenda";
import { groupByDay } from "@/lib/agenda";
import { shortDate } from "@/lib/text";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { addAgendaItemAction, deleteAgendaItemAction } from "../actions";

export const metadata = { title: "Agenda · Orange Lobby" };

export default async function AgendaAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const days = groupByDay(await listAgenda(ev.id));
  const total = days.reduce((n, d) => n + d.items.length, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <p className="text-sm text-muted">{total} session{total === 1 ? "" : "s"} across {days.length} day{days.length === 1 ? "" : "s"}</p>
      </div>
      {error && <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {days.length === 0 && (
            <Card className="p-6 text-sm text-muted">No sessions yet. Add the first one on the right; attendees see the agenda grouped by day, filtered by their category.</Card>
          )}
          {days.map((d) => (
            <Card key={d.day} className="p-4">
              <h2 className="mb-2 text-base font-extrabold">{shortDate(d.day)}</h2>
              <ul className="divide-y divide-line text-sm">
                {d.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 gap-4">
                      <div className="w-24 shrink-0 tabular-nums text-muted">{i.starts_at}{i.ends_at ? ` – ${i.ends_at}` : ""}</div>
                      <div className="min-w-0">
                        <div className="font-bold">{i.title}</div>
                        <div className="text-xs text-muted">{[i.location, i.description].filter(Boolean).join(" · ")}</div>
                        {i.categories && i.categories.length > 0 && <div className="mt-1"><Badge tone="brand">{i.categories.join(", ")}</Badge></div>}
                      </div>
                    </div>
                    <form action={deleteAgendaItemAction.bind(null, ev.id, i.id)}><ConfirmButton message={`Delete "${i.title}"?`}>Delete</ConfirmButton></form>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <form action={addAgendaItemAction.bind(null, ev.id)} className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:sticky xl:top-6">
          <h2 className="text-base font-extrabold">Add a session</h2>
          <Field label="Day" name="day" type="date" defaultValue={ev.starts_on} />
          <div className="grid grid-cols-2 gap-3"><Field label="Starts" name="starts_at" type="time" /><Field label="Ends" name="ends_at" type="time" /></div>
          <Field label="Title" name="title" />
          <Field label="Location" name="location" placeholder="Grand Ballroom" />
          <Field label="Description" name="description" textarea />
          <Field label="Only for these categories" name="categories" placeholder="Blank = everyone. Otherwise: VIP, Speakers" />
          <Field label="Order among sessions at the same time (lower first)" name="sort_order" type="number" defaultValue="0" />
          <SubmitButton>Add session</SubmitButton>
        </form>
      </div>
    </div>
  );
}
