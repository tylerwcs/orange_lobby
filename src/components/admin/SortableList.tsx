"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { RowMoveContext } from "@/components/admin/RowActions";

export type SortableRow = {
  /** What the reorder action receives - an item id, or `slot:<round>` (D197). */
  key: string;
  /** What a screen reader hears the handle move. */
  label: string;
  /** The row itself, rendered on the server: forms, dialogs and all. */
  node: React.ReactNode;
};

/**
 * One agenda day's rows in the organiser's order (D197). The same drag-and-arrow-key idiom as
 * CheckpointList: a drag is a pointer gesture no keyboard can perform, so the handle also takes
 * the arrow keys; both go through `moveItem`, and both save at once. HTML5 drag-and-drop is also
 * unreliable on touch, so each row's ⋯ menu (RowActions) offers Move up and Move down, read from
 * RowMoveContext - a third route through the same `move`, so all three stay in step. They used
 * to be two arrow buttons on every row, beside that row's own buttons.
 *
 * The rows arrive already rendered - their Edit dialogs hold server-rendered forms - so this
 * component only owns their order. Optimistic, not local state: when the action settles the
 * list becomes whatever the server stored, so a refused reorder never leaves a lie on screen.
 */
export function SortableList({ rows, reorder, empty, hint = "Drag a row by its handle, focus the handle and use the arrow keys, or use Move up and Move down in its menu, to set the order attendees see. Saved as you go." }: {
  rows: SortableRow[];
  reorder: (keys: string[]) => Promise<void>;
  empty: string;
  /** The line under the list saying what the order is for. */
  hint?: string;
}) {
  const [order, setOrder] = useOptimistic(rows);
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
      setMessage(`${moved.label} moved to position ${next.indexOf(moved) + 1} of ${next.length}`);
      await reorder(next.map((r) => r.key));
    });
  };

  if (order.length === 0) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>;

  return (
    <div>
      <ul className="divide-y divide-border" aria-busy={pending}>
        {order.map((r, i) => (
          <li
            key={r.key}
            draggable
            onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
            onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
            onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
            onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
            className={`flex items-center gap-2 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
          >
            <button
              type="button"
              aria-label={`Reorder ${r.label}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
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
              <RowMoveContext.Provider value={{ up: i > 0 ? () => move(i, i - 1) : null, down: i < order.length - 1 ? () => move(i, i + 1) : null }}>
                {r.node}
              </RowMoveContext.Provider>
            </div>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="pt-2 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
