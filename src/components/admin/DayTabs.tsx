"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The agenda's days as tabs, one day on screen at a time, the way attendees see them.
 * Stacked, a three-day programme was a long scroll to reach the day you were fixing.
 *
 * Every day's panel is rendered by the server and handed over, so switching is instant. The
 * day on screen is kept in `?day=` with `replaceState` — no navigation — so a reload lands
 * back on it. The actions redirect to the bare agenda address (with a flash); the page stays
 * mounted, so the tab stays put, and the effect below writes `?day=` back into the address.
 * Give it `key={day ids}` where it is used: adding or deleting a day then remounts it on the
 * day `initial` names — the new one, after Add day.
 */
export function DayTabs({ days, initial, panels }: {
  days: { id: string; label: string; date: string }[];
  initial: string;
  panels: Record<string, React.ReactNode>;
}) {
  const [value, setValue] = useState(initial);
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("day") === value) return;
    const url = new URL(window.location.href);
    url.searchParams.set("day", value);
    window.history.replaceState(window.history.state, "", url);
  }, [params, value]);

  return (
    <Tabs value={value} onValueChange={(v) => setValue(String(v))} className="gap-3">
      <TabsList className="group-data-horizontal/tabs:h-auto max-w-full justify-start overflow-x-auto overflow-y-hidden">
        {days.map((d) => (
          <TabsTrigger key={d.id} value={d.id} className="h-auto flex-none flex-col gap-0 px-3 py-1.5">
            <span>{d.label}</span>
            <span className="text-xs font-normal text-muted-foreground">{d.date}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {days.map((d) => (
        <TabsContent key={d.id} value={d.id}>{panels[d.id]}</TabsContent>
      ))}
    </Tabs>
  );
}
