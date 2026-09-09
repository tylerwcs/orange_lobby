import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="flex min-h-screen flex-col bg-canvas md:flex-row"><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">Skip to content</a>{children}</div>;
}
