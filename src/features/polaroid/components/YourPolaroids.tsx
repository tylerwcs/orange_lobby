"use client";
import { DangerButton } from "@/components/admin/DangerButton";
import { toast } from "@/lib/toast-store";
import type { CardData } from "../lib/wire";
import type { RemoveResult } from "../lib/post-types";
import { PolaroidCard } from "./PolaroidCard";

/** "Your polaroids" (D482): what this attendee has up, each removable by them. */
export function YourPolaroids({ items, stickerSrc, remove }: {
  items: (CardData & { id: string })[];
  stickerSrc: Record<string, string>;
  remove: (id: string) => Promise<RemoveResult>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-extrabold">Your polaroids</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((p) => (
          <div key={p.id} className="flex shrink-0 flex-col items-center gap-2 pt-3">
            <PolaroidCard card={p} width={140} stickerSrc={stickerSrc} />
            <DangerButton message="This takes it off the wall and deletes the photo."
              action={async () => {
                const r = await remove(p.id);
                toast(r.ok ? "Removed from the wall." : r.error, r.ok ? "ok" : "error");
              }}>
              Remove
            </DangerButton>
          </div>
        ))}
      </div>
    </section>
  );
}
