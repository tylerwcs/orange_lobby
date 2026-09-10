import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { Sidebar } from "@/components/admin/Sidebar";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, email } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <>
      <Sidebar email={email} event={{ id: ev.id, name: ev.name, status: ev.status }} />
      <main id="main" className="min-w-0 flex-1 p-3 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
        {children}
      </main>
    </>
  );
}
