import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, email } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  return (
    <>
      <AppSidebar email={email} event={{ id: ev.id, name: ev.name, status: ev.status, check_in_enabled: ev.check_in_enabled }} />
      <SidebarInset id="main" className="min-w-0 p-4 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
        {children}
      </SidebarInset>
    </>
  );
}
