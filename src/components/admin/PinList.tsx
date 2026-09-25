"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import type { PinnedField } from "@/lib/pinned-fields";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { RowActions, RowMoveContext } from "@/components/admin/RowActions";

/**
 * The pinned facts, in the order they sit on the badge card.
 *
 * Order is not decoration here: the first pin takes the large treatment the table number
 * used to have, so which row is first is a visible design decision rather than the order
 * someone happened to tick things in. Same handle-and-arrow-keys idiom as the checkpoint
 * and tile lists, so the order is reachable without a pointer.
 *
 * Unpin sits in the row's ⋯ menu (RowActions), which calls the action rather than posting a
 * form: the list sits on Settings' Event details tab, inside the form that saves every tab,
 * and a form may not hold another.
 */
export function PinList({ pins, labels, reorder, remove }: {
  pins: PinnedField[];
  /** Field key to the name the admin knows it by, for rows whose caption is overridden. */
  labels: Record<string, string>;
  reorder: (keys: string[]) => Promise<void>;
  remove: (key: string) => Promise<void>;
}) {
  const [order, setOrder] = useOptimistic(pins);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const fromRef = useRef<number | null>(null);

  const name = (p: PinnedField) => labels[p.key] ?? p.key;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const moved = order[from];
    const next = moveItem(order, from, to);
    startTransition(async () => {
      setOrder(next);
      setMessage(`${name(moved)} moved to position ${next.indexOf(moved) + 1} of ${next.length}`);
      await reorder(next.map((p) => p.key));
    });
  };

  if (order.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">Nothing pinned. The badge card shows the attendee&apos;s name and check-in status only.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border" aria-busy={pending}>
        {order.map((p, i) => (
          <li
            key={p.key}
            draggable
            onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
            onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
            onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
            onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
            className={`flex flex-wrap items-center gap-3 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
          >
            <button
              type="button"
              aria-label={`Reorder ${name(p)}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{name(p)}</span>
                {i === 0 && <Badge variant="secondary">Large</Badge>}
              </div>
              {p.label && <div className="text-xs text-muted-foreground">Shown as “{p.label}”</div>}
            </div>
            <RowMoveContext.Provider value={{ up: i > 0 ? () => move(i, i - 1) : null, down: i < order.length - 1 ? () => move(i, i + 1) : null }}>
              <RowActions name={name(p)} remove={{ action: () => remove(p.key), message: "It comes off every badge straight away. Pin it again any time.", label: "Unpin" }} />
            </RowMoveContext.Provider>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="pt-2 text-xs text-muted-foreground">The first pin gets the large treatment. Drag by the handle — or focus it and use the arrow keys, or use Move up and Move down in its menu — to change which. Saved as you go.</p>
      )}
    </div>
  );
}
