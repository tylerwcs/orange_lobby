"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * D393: Add to calendar as a choice of two. On an iPhone, Safari gives a .ics file to Apple
 * Calendar and nothing else, so Outlook needs its own way in: the same route with
 * `&app=outlook`, which redirects to Outlook on the web with the session filled in.
 *
 * Each caller keeps its own look for the trigger (a link on the booked line, a pill on the
 * agenda, the big sticky button) and passes it as `className` and `children`.
 */
export function AddToCalendar({ href, className, children, align = "end" }: {
  /** The seat's calendar.ics route, with its `?session=`. */
  href: string;
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={className}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        {/* Plain links, not router pushes: one is a file, the other leaves the app. No
            `download` on the file - iOS would save it instead of offering the calendar. */}
        <DropdownMenuItem render={<a href={href} />} className="flex-col items-start gap-0 py-2">
          <span className="font-bold">Apple Calendar</span>
          <span className="text-xs text-muted-foreground">iPhone, iPad or Mac</span>
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={`${href}&app=outlook`} target="_blank" rel="noopener noreferrer" />} className="flex-col items-start gap-0 py-2">
          <span className="font-bold">Outlook</span>
          <span className="text-xs text-muted-foreground">Your work Microsoft 365 account</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
