"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES, type TablePrefs } from "@/lib/columns";
import { writeTablePrefs } from "@/lib/table-prefs-cookie";

/**
 * How many attendees a page shows. Remembered per browser and per event with the rest of the
 * table layout, because it is a question of the screen, not the task: a desk laptop wants
 * everyone, a phone wants fifty. The server reads it from the cookie, so a change refreshes.
 */
export function PageSizePicker({ eventId, prefs }: { eventId: string; prefs: TablePrefs }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const choose = (perPage: number) => {
    writeTablePrefs(eventId, prefs, { perPage });
    // Page 3 of 50 is not page 3 of 200: start again at the top.
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      router.refresh();
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Show</span>
      <select
        value={prefs.perPage}
        onChange={(e) => choose(Number(e.target.value))}
        disabled={pending}
        aria-busy={pending}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n === 0 ? "All" : n}</option>)}
      </select>
      <span>per page</span>
    </label>
  );
}
