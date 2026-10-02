"use client";
import { MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** D374: an entry's ⋯ offers its photos only - attendees cannot edit or delete (D368). */
export function EntryPhotos({ title, photos }: { title: string; photos: { label: string; url: string | null }[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" aria-label={`View photos for ${title}`} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" />}>
        <MoreHorizontal aria-hidden className="size-5" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogTitle className="pr-8 text-lg font-extrabold">{title}</DialogTitle>
        <div className="flex flex-col gap-4">
          {photos.map((p) => (
            <figure key={p.label} className="flex flex-col gap-1.5">
              <figcaption className="text-sm font-bold">{p.label}</figcaption>
              {p.url
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimisable asset
                ? <img src={p.url} alt={p.label} className="w-full rounded-lg border border-border" />
                : <span className="text-sm text-muted-foreground">Unavailable</span>}
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
