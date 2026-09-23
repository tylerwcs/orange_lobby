"use client";

import { useState } from "react";
import type { Announcement } from "@/lib/types";
import { Icon } from "@/components/ui/icon";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { shortDateTime } from "@/lib/text";
import { AnnouncementList } from "./AnnouncementList";

/**
 * The phone home's one line about what changed, which opens every announcement in place.
 *
 * It used to link to /announcements. Reading one message cost a page load and a trip back, and
 * the message that brought somebody here is rarely the only one they missed — so the dialog
 * shows the whole list, pinned first (`listAnnouncements`' order), the same way `AgendaImage`
 * opens a picture without leaving the agenda.
 *
 * `a` is the banner's own line — the pinned one, else the newest — and is always `items[0]`
 * today, but it is passed separately so the banner does not quietly depend on that ordering.
 */
export function AnnouncementBanner({ a, items }: { a: Announcement; items: Announcement[] }) {
  const [open, setOpen] = useState(false);
  const when = shortDateTime(a.created_at);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[12px] bg-accent px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-haspopup="dialog"
      >
        <Icon name="megaphone" size={20} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-primary">{a.title}</div><div className="text-xs text-primary">{when}</div></div>
        <Icon name="chevron" size={18} className="text-primary" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3">
          <DialogTitle className="text-lg font-extrabold">Announcements</DialogTitle>
          <div className="-mx-1 min-h-0 overflow-y-auto px-1 pb-1">
            <AnnouncementList items={items} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
