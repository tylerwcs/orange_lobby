import type { AgendaItem } from "@/lib/types";
import { groupByDay } from "@/lib/agenda";

export function AgendaList({ items }: { items: AgendaItem[] }) {
  const days = groupByDay(items);
  if (days.length === 0) return <p className="text-gray-500">Agenda will be published soon.</p>;
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d.day}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{new Date(d.day + "T00:00:00").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })}</h2>
          <ul className="space-y-3">
            {d.items.map((i) => (
              <li key={i.id} className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">{i.starts_at}{i.ends_at ? ` – ${i.ends_at}` : ""}{i.location ? ` · ${i.location}` : ""}</div>
                <div className="font-medium">{i.title}</div>
                {i.description && <p className="mt-1 text-sm text-gray-600">{i.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
