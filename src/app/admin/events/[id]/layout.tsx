import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";

const tabs = ["", "settings", "modules", "attendees", "agenda", "announcements", "info", "checkpoints"];

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{ev.name} <span className="ml-2 text-xs uppercase text-gray-500">{ev.status}</span></h1>
      <nav className="my-4 flex flex-wrap gap-3 border-b text-sm">
        {tabs.map((t) => (
          <Link key={t} href={`/admin/events/${id}/${t}`} className="pb-2 capitalize hover:text-orange-600">{t || "overview"}</Link>
        ))}
        <Link href={`/scan/${id}`} className="pb-2 text-orange-600">Scanner</Link>
      </nav>
      {children}
    </div>
  );
}
