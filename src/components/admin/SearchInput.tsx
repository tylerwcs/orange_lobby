"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * Filters as you type. The results come from the server, so the round trip is real and
 * has to be visible: without a pending state the list simply sits there for a moment and
 * the box looks broken. The spinner marks the trip and the count says what came back.
 */
export function SearchInput({ initial, matches, total }: { initial: string; matches: number; total: number }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
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
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 200);
    return () => clearTimeout(t);
  }, [value, params, pathname, router]);

  const typed = value.trim().length > 0;
  // Settled means the server has caught up with what is in the box, so the count is
  // describing this search rather than the previous one.
  const settled = !pending && value === (params.get("q") ?? "");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-64 flex-1 sm:max-w-sm">
        <label htmlFor="attendee-search" className="sr-only">Search attendees</label>
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id="attendee-search" type="search" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="Search name, email or company"
          className="min-h-11 w-full rounded-[var(--radius-control)] bg-canvas pl-9 pr-10 text-sm font-semibold"
        />
        {pending && (
          <span aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-ink/25 border-t-ink" />
        )}
      </div>
      <p role="status" aria-live="polite" className="text-sm font-semibold text-muted">
        {pending ? "Searching…" : typed && settled
          ? `${matches} ${matches === 1 ? "match" : "matches"} for “${value.trim()}”`
          : `${total} attendees`}
      </p>
    </div>
  );
}
