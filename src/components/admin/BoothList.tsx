"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Booth } from "@/lib/types";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

type Reorder = (ids: string[]) => Promise<void>;
type Rename = (boothId: string, fd: FormData) => Promise<void>;
type Delete = (boothId: string) => Promise<void>;

/**
 * The booths an event runs, in the order the QR sheets get handed out. Follows
 * CheckpointList exactly: `useOptimistic` for order, a drag handle that is also the
 * keyboard route (focus it, arrow keys move the row — a drag with no keyboard
 * equivalent fails WCAG 2.5.7), and both routes going through `moveItem` so they
 * cannot drift apart.
 */
export function BoothList({ items, counts, reorder, renameBooth, deleteBooth }: {
  items: Booth[];
  counts: Record<string, number>;
  reorder: Reorder;
  renameBooth: Rename;
  deleteBooth: Delete;
}) {
  const [order, setOrder] = useOptimistic(items);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const fromRef = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const moved = order[from];
    const next = moveItem(order, from, to);
    startTransition(async () => {
      setOrder(next);
      setMessage(`${moved.name} moved to position ${next.indexOf(moved) + 1} of ${next.length}`);
      await reorder(next.map((b) => b.id));
    });
  };

  return (
    <div>
      <ul className="divide-y divide-border" aria-busy={pending}>
        {order.map((b, i) => {
          const n = counts[b.id] ?? 0;
          const stamped = n > 0;
          return (
            <li
              key={b.id}
              draggable
              onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
              onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
              onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
              onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
              className={`flex flex-wrap items-center gap-3 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
            >
              {/* The handle is the keyboard route as well as the pointer one: focus it and
                  the arrow keys move the row. A drag with no keyboard equivalent fails
                  WCAG 2.5.7, and a pair of arrow buttons on every row was the clutter this
                  replaces. */}
              <button
                type="button"
                aria-label={`Reorder ${b.name}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
                onKeyDown={(e) => {
                  const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                  if (to === null) return;
                  e.preventDefault();
                  move(i, to);
                }}
                className="flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-background active:cursor-grabbing"
              >
                <Icon name="grip" size={18} />
              </button>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{b.name}</div>
                {b.location && <div className="text-xs font-semibold text-muted-foreground">{b.location}</div>}
              </div>

              <Badge variant="secondary" className="tabular-nums">{n} stamp{n === 1 ? "" : "s"}</Badge>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link href={`?qr=${b.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Icon name="qr" size={14} />
                  Scanner QR
                </Link>

                <Modal title={`Rename ${b.name}`} trigger="Rename" variant="outline">
                  <form action={renameBooth.bind(null, b.id)} className="grid gap-4">
                    <Field label="Name" name="name" defaultValue={b.name} />
                    <Field label="Location (optional)" name="location" defaultValue={b.location} />
                    <SubmitButton>Save</SubmitButton>
                  </form>
                </Modal>

                {stamped ? (
                  // Disabled once a booth has a stamp (D94). The reason lives in a title and
                  // an aria-label, not a colour — a native `disabled` control that stays
                  // labelled, not a silent tint on an icon.
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    title={`${b.name} has stamped ${n} attendee${n === 1 ? "" : "s"}, so it can't be deleted.`}
                    aria-label={`Delete ${b.name}. Disabled: it has stamped ${n} attendee${n === 1 ? "" : "s"}.`}
                  >
                    Delete
                  </Button>
                ) : (
                  <form action={() => deleteBooth(b.id)}>
                    <ConfirmButton message={`Delete “${b.name}”? This cannot be undone.`} className="text-destructive">Delete</ConfirmButton>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="p-4 pt-3 text-xs text-muted-foreground">Drag a row by its handle — or focus the handle and use the arrow keys — to set the order the printed sheets suggest walking. Saved as you go.</p>
      )}
    </div>
  );
}
