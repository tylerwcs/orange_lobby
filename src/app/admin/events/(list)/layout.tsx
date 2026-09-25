import { requireAdmin } from "@/lib/auth";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

/**
 * The events list's frame, lifted out of the page so its `loading.tsx` renders inside it.
 * When the sidebar lived in the page, a skeleton at this level would have replaced the
 * sidebar too, and it would vanish and come back on every visit.
 *
 * A route group rather than `events/layout.tsx`: `[id]` has its own layout with the event's
 * sidebar, and must not be wrapped in this one.
 */
export default async function EventsListLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <>
      <AppSidebar email={email} />
      <SidebarInset id="main" className="min-w-0 p-4 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
        {/* The same centred cap as an event's pages ([id]/layout.tsx). */}
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </SidebarInset>
    </>
  );
}
