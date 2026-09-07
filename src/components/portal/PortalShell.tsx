import Link from "next/link";
import type { Event } from "@/lib/types";

const nav = (personal: boolean) => [
  { href: "", label: "Home" }, { href: "/agenda", label: "Agenda" },
  ...(personal ? [{ href: "/seat", label: "My seat" }] : []),
  { href: "/announcements", label: "News" }, { href: "/info", label: "Info" },
];

export function PortalShell({ event, basePath, personal, children }: { event: Event; basePath: string; personal: boolean; children: React.ReactNode }) {
  if (event.status === "draft") {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        {event.banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.banner_url} alt="" className="mb-6 w-full rounded-lg" />
        )}
        <h1 className="text-xl font-semibold">{event.name}</h1>
        <p className="mt-2 text-gray-600">Coming soon. Check back closer to the event.</p>
      </main>
    );
  }
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-20" style={{ ["--brand" as string]: event.primary_color }}>
      {event.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.banner_url} alt="" className="w-full" />
      )}
      <div className="p-4">{children}</div>
      <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t bg-white py-2 text-xs">
        {nav(personal).map((n) => (
          <Link key={n.href} href={`${basePath}${n.href}`} className="px-2 py-1 text-gray-700">{n.label}</Link>
        ))}
      </nav>
    </div>
  );
}
