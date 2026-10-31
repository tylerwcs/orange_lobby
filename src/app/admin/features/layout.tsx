import { requireSignedIn } from "@/lib/access";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

/** The same frame as the events list (events/(list)/layout.tsx), so loading.tsx renders inside it and the sidebar stays put. */
export default async function FeaturesLayout({ children }: { children: React.ReactNode }) {
  const { email, kind } = await requireSignedIn();
  return (
    <>
      <AppSidebar email={email} admin={kind === "admin"} />
      <SidebarInset id="main" className="min-w-0 p-4 pt-6 lg:p-6 lg:pt-8 2xl:p-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </SidebarInset>
    </>
  );
}
