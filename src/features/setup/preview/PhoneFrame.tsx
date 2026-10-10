"use client";
import { brandStyle } from "@/lib/brand";

/**
 * The phone every setup preview draws in (D445): a fixed screen that scrolls, coloured with the
 * event's brand colour as the portal is.
 */
export function PhoneFrame({ primaryColor, label, compact = false, children }: {
  primaryColor: string;
  label: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`mx-auto rounded-[2.25rem] bg-zinc-900 p-2.5 shadow-xl ${compact ? "w-[240px]" : "w-[300px]"}`} aria-label={label} role="img">
      <div className={`overflow-y-auto rounded-[1.75rem] bg-background ${compact ? "h-[460px]" : "h-[600px]"}`} style={brandStyle(primaryColor) as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}
