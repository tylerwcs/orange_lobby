import { requireEventAccess } from "@/lib/access";
import { eventFeatures, hiddenNav } from "@/features/catalogue";
import { waitingCounts } from "@/features/setup";
import { countCancelRequests } from "@/lib/db/attendees";
import { countEntries } from "@/features/registration-queue";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev, actor } = await requireEventAccess(id);
  const features = await eventFeatures(ev.id);
  const admin = actor.kind === "admin";
  // D565: Setup is admin-only, so its waiting count is only worked out for an admin.
  const waiting = admin ? (await waitingCounts([ev.id]))[ev.id] ?? 0 : 0;
  // D598, D698: cancellation requests and registrations pending approval wait on admins and committee alike.
  const [requests, pending] = await Promise.all([countCancelRequests(ev.id), countEntries(ev.id, "pending")]);
  return (
    <>
      <AppSidebar email={actor.email} event={{ id: ev.id, name: ev.name, status: ev.status, check_in_enabled: ev.check_in_enabled }} hidden={hiddenNav(features)} badges={{ setup: waiting, attendees: requests + pending }} admin={admin} />
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
