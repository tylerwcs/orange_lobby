import { Suspense } from "react";
import { requireSignedIn } from "@/lib/access";
import { Toaster } from "@/components/ui/toaster";
import { Flash } from "@/components/admin/Flash";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSignedIn();
  return (
    <TooltipProvider>
      <SidebarProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-background"
        >
          Skip to content
        </a>
        {children}
        {/* `useSearchParams` needs a boundary it can suspend at; the toast stack itself is
            not tied to the URL and mounts outside it. */}
        <Suspense fallback={null}><Flash /></Suspense>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
