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
        {/* Capped at max-w-6xl and centred beside the sidebar. At the full width of a wide monitor
            every card stretched to ~800px and the fields inside spread apart with it; nothing on
            a form page gets better past this. Centred, because left-aligned piled all the
            leftover width on the right and the page looked lopsided. A page whose table
            genuinely needs the room marks its root `data-wide` (Attendees, an activity's bookings
            and submissions), and its loading.tsx does the same so the skeleton does not jump. */}
        <div className="mx-auto w-full max-w-6xl has-[[data-wide]]:max-w-none">{children}</div>
      </SidebarInset>
    </>
  );
}
