"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { sportCookie } from "../lib/sport-cookie";

/**
 * D663: the Results tab's sport. Picking one remembers it on this phone (a cookie the server reads,
 * so the page arrives already on it) and moves the page there; the tab links carry it too.
 */
export function SportSelect({ activityId, path, current, sports }: {
  activityId: string;
  path: string;
  current: string;
  sports: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="relative min-w-0 flex-1">
      <select
        aria-label="Sport" value={current} disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          document.cookie = `${sportCookie(activityId)}=${encodeURIComponent(id)}; path=/e; max-age=${60 * 60 * 24 * 60}; samesite=lax`;
          start(() => router.push(`${path}?${new URLSearchParams({ tab: "results", sport: id })}`, { scroll: false }));
        }}
        className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-4 pr-10 text-base font-extrabold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
      >
        {sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted-foreground">{pending ? <Spinner /> : "▾"}</span>
    </div>
  );
}
