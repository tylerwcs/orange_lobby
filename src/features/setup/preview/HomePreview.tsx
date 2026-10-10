"use client";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { LauncherGrid } from "@/components/portal/LauncherGrid";
import { launcherItems, sectionIcons } from "@/lib/launcher";
import { brandStyle } from "@/lib/brand";
import type { BasicsAnswers } from "../sections/basics";

export type PreviewBasics = Pick<BasicsAnswers, "name" | "starts_on" | "ends_on" | "venue_name" | "primary_color" | "logo_url" | "banner_url">;
export type PreviewSlot = "header" | "logo" | "banner" | "colour";

const SLOT_LABELS: Record<PreviewSlot, string> = {
  header: "Name, dates and venue", logo: "Logo · 512 × 512", banner: "Banner · 2400 × 800", colour: "Brand colour",
};

// The launcher as every attendee's home starts: the portal's own sections, no tiles. Built once.
const ITEMS = launcherItems({ basePath: "", personal: true, hasInfo: true, tiles: [], icons: sectionIcons(null) });

/**
 * The portal home as attendees will see it, drawn from the organiser's draft (D445). The real
 * header and launcher components, so the preview can't drift from the portal. Empty image
 * slots show the image guide's dashed placeholder with the size to send. Focusing a field
 * outlines its slot; clicking a slot asks for its field.
 */
export function HomePreview({ basics, focused = null, onSlot, compact = false }: {
  basics: PreviewBasics;
  focused?: PreviewSlot | null;
  onSlot?: (slot: PreviewSlot) => void;
  compact?: boolean;
}) {
  const event = {
    name: basics.name.trim() || "Your event name",
    logo_url: basics.logo_url || null,
    starts_on: basics.starts_on || null,
    ends_on: basics.ends_on || null,
    venue_name: basics.venue_name.trim() || null,
  };
  // The header slot fills the screen edge to edge, where the scroll area would clip a ring drawn
  // outside it, so its outline is drawn inside (over the header) and its label sits on the right,
  // clear of the logo. Every label sits inside its slot for the same reason.
  const slot = (name: PreviewSlot, children: React.ReactNode, className = "") => (
    <div
      data-setup-slot={name}
      // stopPropagation: the logo slot sits inside the header slot; a click names the innermost.
      onClick={onSlot ? (e) => { e.stopPropagation(); onSlot(name); } : undefined}
      className={`relative rounded-xl transition-shadow ${onSlot ? "cursor-pointer" : ""} ${focused !== name ? "" : name === "header" ? "outline-2 -outline-offset-2 outline-primary" : "ring-2 ring-primary ring-offset-2 ring-offset-background"} ${className}`}
    >
      {children}
      {focused === name && (
        <span className={`pointer-events-none absolute top-1 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground ${name === "header" ? "right-1" : "left-1"}`}>
          {SLOT_LABELS[name]}
        </span>
      )}
    </div>
  );

  return (
    <div className={`mx-auto rounded-[2.25rem] bg-zinc-900 p-2.5 shadow-xl ${compact ? "w-[240px]" : "w-[300px]"}`} aria-label="Preview of your portal home" role="img">
      <div className={`overflow-y-auto rounded-[1.75rem] bg-background ${compact ? "h-[460px]" : "h-[600px]"}`} style={brandStyle(basics.primary_color) as React.CSSProperties}>
        {slot("header", (
          <div className="relative">
            <PortalHeader event={event} />
            {/* The logo's own slot, over the mark. Without a logo attendees see initials; the
                dashed outline says a logo goes here. */}
            <div className="absolute left-4 top-4 size-10">
              {slot("logo", <div className={`size-10 rounded-[10px] ${basics.logo_url ? "" : "border-2 border-dashed border-orange-400"}`} />)}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-4 p-4">
          {slot("banner", basics.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={basics.banner_url} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
          ) : (
            <div className="flex aspect-[3/1] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-400 bg-orange-50 text-center text-[11px] font-extrabold text-orange-800">
              Banner<span className="font-semibold">2400 × 800 · optional</span>
            </div>
          ))}
          {slot("colour", <div inert><LauncherGrid items={ITEMS} layout="row" /></div>)}
          <div aria-hidden className="flex flex-col gap-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-14 rounded-xl border border-border bg-card" />
            <div className="h-14 rounded-xl border border-border bg-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
