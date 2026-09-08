import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="flex min-h-screen flex-col bg-canvas md:flex-row">{children}</div>;
}
