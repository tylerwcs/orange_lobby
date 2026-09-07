import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <Link href="/admin" className="font-semibold text-orange-600">Orange Lobby</Link>
        <form action={signOut} className="text-sm text-gray-600">
          {ctx.email} · <button className="underline">Sign out</button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
