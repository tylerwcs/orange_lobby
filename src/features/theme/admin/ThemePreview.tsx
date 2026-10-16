"use client";
import { useMemo } from "react";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { LauncherGrid } from "@/components/portal/LauncherGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { launcherItems, sectionIcons } from "@/lib/launcher";
import { TITLE_INK } from "@/lib/ink";
import { PhoneFrame } from "@/features/setup/client";
import { themeTokens, type EventTheme } from "../client";

export type PreviewEvent = {
  name: string;
  logo_url: string | null;
  banner_url: string | null;
  starts_on: string | null;
  ends_on: string | null;
  venue_name: string | null;
};

const ROWS = [
  { time: "9:00", end: "10:00", title: "Registration and breakfast", place: "Foyer", live: true },
  { time: "10:00", end: "11:30", title: "Opening keynote", place: "Grand Ballroom", live: false },
  { time: "12:30", end: "13:30", title: "Lunch", place: "Level 3", live: false },
];

/**
 * D626: the portal home in the theme being picked, before it is saved. The frame carries the
 * same tokens an attendee page's `:root` does (themeTokens, D622) and the colour scheme, and
 * draws the real header, card and launcher components, so the preview cannot drift from the
 * portal. Inert: nothing in it is a working control.
 */
export function ThemePreview({ theme, primary, event }: { theme: EventTheme; primary: string; event: PreviewEvent }) {
  const style = useMemo(() => {
    const { tokens, dark } = themeTokens(theme, primary);
    // D636: the glow paints the frame as globals.css paints an attendee page.
    return { ...tokens, colorScheme: dark ? "dark" : "light", backgroundImage: "var(--page-glow, none)", backgroundRepeat: "no-repeat" } as React.CSSProperties;
  }, [theme, primary]);
  const items = useMemo(
    () => launcherItems({ basePath: "", personal: true, hasInfo: true, tiles: [], icons: sectionIcons(null), tint: primary }),
    [primary],
  );

  return (
    <PhoneFrame primaryColor={primary} label="Preview of the portal home in this theme" style={style}>
      <div inert className="min-h-full text-foreground">
        <PortalHeader event={event} />
        <div className="flex flex-col gap-4 p-4">
          {event.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.banner_url} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
          )}
          <div className="flex flex-col gap-1">
            <div className={`text-xl font-extrabold leading-tight ${TITLE_INK}`}>Hi, Alex</div>
            <p className="text-sm text-muted-foreground">Here is what&apos;s on today.</p>
          </div>
          <Button type="button" className="w-full">View my badge</Button>
          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {ROWS.map((r) => (
                <div key={r.title} className={`flex gap-3 rounded-[14px] bg-card p-3 ${r.live ? "border-2 border-primary" : "border border-border"}`}>
                  <div className="w-11 shrink-0">
                    <div className={`text-[13px] font-extrabold ${r.live ? "text-primary" : "text-muted-foreground"}`}>{r.time}</div>
                    {r.live
                      ? <div className="text-[11px] font-extrabold tracking-[0.08em] text-primary">NOW</div>
                      : <div className="text-[11px] text-muted-foreground">{r.end}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.place}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <LauncherGrid items={items} layout="row" />
        </div>
      </div>
    </PhoneFrame>
  );
}
