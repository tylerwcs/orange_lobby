"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/** Filters as you type: no submit button, and typing resets to page 1. */
export function SearchInput({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("q", value); else next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    }, 250);
    return () => clearTimeout(t);
  }, [value, params, pathname, router]);

  return (
    <div className="relative min-w-56 flex-1">
      <label htmlFor="attendee-search" className="sr-only">Search attendees</label>
      <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input id="attendee-search" type="search" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="Search name, email or company"
        className="min-h-11 w-full rounded-[var(--radius-control)] bg-canvas pl-9 pr-3 text-sm font-semibold" />
    </div>
  );
}
