"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { signOut } from "@/app/login/actions";
import { groupsFor } from "./nav";

export function Sidebar({ email, event }: { email: string; event?: { id: string; name: string; status: string } | null }) {
  const pathname = usePathname();
  const groups = groupsFor(event);
  return (
    <aside className="flex w-full flex-col gap-4 border-b border-line bg-surface p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <Link href="/admin" className="flex items-center gap-2 font-extrabold"><span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-brand text-xs text-white">OL</span> Orange Lobby</Link>
      {event && <div className="rounded-[10px] bg-canvas p-3"><div className="truncate text-sm font-bold">{event.name}</div><div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{event.status}</div></div>}
      <nav className="flex gap-4 overflow-x-auto md:flex-col">
        {groups.map((g) => (
          <div key={g.title} className="flex shrink-0 flex-col gap-0.5">
            <div className="px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{g.title}</div>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={`flex min-h-10 items-center gap-2 rounded-[8px] px-2 text-sm ${pathname === i.href ? "bg-brand-soft font-bold text-brand-ink" : "font-semibold text-ink hover:bg-canvas"}`}><Icon name={i.icon} size={18} />{i.label}</Link>
            ))}
          </div>
        ))}
      </nav>
      <form action={signOut} className="mt-auto flex items-center justify-between text-xs text-muted"><span className="truncate">{email}</span><button className="flex items-center gap-1 font-bold"><Icon name="logout" size={14} /> Sign out</button></form>
    </aside>
  );
}
