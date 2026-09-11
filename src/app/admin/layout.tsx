import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { Toaster } from "@/components/ui/Toaster";
import { Flash } from "@/components/admin/Flash";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">Skip to content</a>
      {children}
      {/* `useSearchParams` needs a boundary it can suspend at; the toast stack itself is
          not tied to the URL and mounts outside it. */}
      <Suspense fallback={null}><Flash /></Suspense>
      <Toaster />
    </div>
  );
}
