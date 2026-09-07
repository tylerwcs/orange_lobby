import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda } from "@/lib/db/agenda";
import { groupByDay } from "@/lib/agenda";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { addAgendaItemAction, deleteAgendaItemAction } from "../actions";

export default async function AgendaAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const days = groupByDay(await listAgenda(ev.id));
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {days.map((d) => (
        <section key={d.day} className="rounded border bg-white p-4">
          <h2 className="mb-2 font-medium">{d.day}</h2>
          <ul className="divide-y text-sm">
            {d.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between py-2">
                <div><span className="font-mono">{i.starts_at}{i.ends_at ? `–${i.ends_at}` : ""}</span> <strong>{i.title}</strong>
                  {i.location && <span className="text-gray-500"> · {i.location}</span>}
                  {i.categories && <span className="ml-2 rounded bg-gray-100 px-1 text-xs">{i.categories.join(", ")}</span>}</div>
                <form action={deleteAgendaItemAction.bind(null, ev.id, i.id)}><ConfirmButton message="Delete this session?">Delete</ConfirmButton></form>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <form action={addAgendaItemAction.bind(null, ev.id)} className="grid gap-3 rounded border bg-white p-4 md:grid-cols-3">
        <h2 className="font-medium md:col-span-3">Add session</h2>
        <Field label="Day" name="day" type="date" defaultValue={ev.starts_on} /><Field label="Starts" name="starts_at" type="time" /><Field label="Ends" name="ends_at" type="time" />
        <Field label="Title" name="title" /><Field label="Location" name="location" /><Field label="Categories (comma separated, blank = everyone)" name="categories" />
        <div className="md:col-span-2"><Field label="Description" name="description" textarea /></div><Field label="Sort order" name="sort_order" type="number" defaultValue="0" />
        <div className="md:col-span-3"><SubmitButton>Add</SubmitButton></div>
      </form>
    </div>
  );
}
