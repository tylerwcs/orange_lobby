"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * The one thing an attendee does on an activity's page - book a session, or send a submission -
 * as a button at the foot of the page that opens it in a dialog. The poster and sections stay
 * underneath, and closing the dialog leaves the attendee where they were.
 *
 * The button floats at the foot of the screen while the page scrolls under it.
 *
 * The body is rendered by the page and passed in, so the session grid's and the form's Server
 * Actions stay exactly as they were; this only owns open and closed. Every action redirects
 * back to the page, and the page keys this component by what the action changes (seats held,
 * submissions sent), so a success remounts it closed while a refusal leaves it open with the
 * toast saying why.
 */
export function ActivityActionDialog({ label, title, description, defaultOpen = false, inline = false, children }: {
  label: string;
  title: string;
  description?: string;
  /** Opens on arrival - how an old `?new=1` submission link still lands on the questions. */
  defaultOpen?: boolean;
  /**
   * A text link in place of the floating button, for when something else owns the foot of
   * the page: once a single session is booked, the big button is Add to calendar and Change
   * session sits in the booked line instead.
   */
  inline?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inline ? (
        <DialogTrigger render={<button type="button" className="flex items-center gap-1 underline" />}>
          {label}
        </DialogTrigger>
      ) : (
        <div className="sticky bottom-4 z-10 mt-2">
          <DialogTrigger render={<Button size="lg" className="h-12 w-full rounded-full text-base font-bold shadow-lg" />}>
            {label}
          </DialogTrigger>
        </div>
      )}
      <DialogContent className="max-h-[85vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle className="text-lg font-extrabold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
