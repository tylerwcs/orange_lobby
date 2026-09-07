import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listEvents } from "@/lib/db/events";

export default async function AdminHome() {
  const { orgId } = await requireAdmin();
  const events = await listEvents(orgId);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link href="/admin/events/new" className="rounded bg-orange-600 px-4 py-2 text-white">New event</Link>
      </div>
      <ul className="divide-y rounded border bg-white">
        {events.map((e) => (
          <li key={e.id} className="flex items-center justify-between p-4">
            <Link href={`/admin/events/${e.id}`} className="font-medium">{e.name}</Link>
            <span className="text-xs uppercase text-gray-500">{e.status}</span>
          </li>
        ))}
        {events.length === 0 && <li className="p-4 text-gray-500">No events yet.</li>}
      </ul>
    </div>
  );
}
