"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import type { Checkpoint } from "@/lib/types";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/Icon";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Badge } from "@/components/ui/Badge";

type Reorder = (ids: string[]) => Promise<void>;

/**
 * One day's checkpoints, in the order the crew will work them.
 *
 * Dragging is the quick way, but it cannot be the only way: a drag is a pointer gesture
 * no keyboard can perform, so every row also carries move up and move down. Both routes
 * go through `moveItem`, so they cannot drift apart, and both save immediately — there
 * is no separate "save order" step to forget.
 */
export function CheckpointList({ day, items, counts, total, activeId, reorder, deleteCheckpoint }: {
  day: string;
  items: Checkpoint[];
  counts: Record<string, number>;
  total: number;
  /** The checkpoint the event is running. Chosen on the Overview, only shown here. */
  activeId: string | null;
  reorder: Reorder;
  deleteCheckpoint: (cpId: string) => Promise<void>;
}) {
  // Optimistic, not local state: the row jumps under the cursor immediately, and when the
  // action settles the list snaps back to whatever the server actually stored — including
  // on failure, so a rejected reorder never leaves a lie on screen.
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
      await reorder(next.map((c) => c.id));
    });
  };

  return (
    <div>
      <ul className="divide-y divide-line" aria-busy={pending}>
        {order.map((c, i) => {
          const n = counts[c.id] ?? 0;
          return (
            <li
              key={c.id}
              draggable
              onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
              onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
              onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
              onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
              className={`flex flex-wrap items-center gap-3 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-brand-soft" : ""}`}
            >
              {/* The handle is the keyboard route as well as the pointer one: focus it and
                  the arrow keys move the row. A drag with no keyboard equivalent fails
                  WCAG 2.5.7, and a pair of arrow buttons on every row was the clutter this
                  replaces. */}
              <button
                type="button"
                aria-label={`Reorder ${c.name}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
                onKeyDown={(e) => {
                  const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                  if (to === null) return;
                  e.preventDefault();
                  move(i, to);
                }}
                className="flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-canvas active:cursor-grabbing"
              >
                <Icon name="grip" size={18} />
              </button>
              <span className="w-5 shrink-0 text-xs font-bold text-muted tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{c.name}</span>
                  {c.id === activeId && <Badge tone="ok" dot>Running now</Badge>}
                </div>
                <div className="text-xs font-semibold text-muted tabular-nums">{n} of {total} checked in</div>
              </div>
              <form action={() => deleteCheckpoint(c.id)}>
                <ConfirmButton message={`Delete “${c.name}” and its ${n} check-in${n === 1 ? "" : "s"}? This cannot be undone.`} className="text-danger-strong">Delete</ConfirmButton>
              </form>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="pt-2 text-xs text-muted">Drag a row by its handle — or focus the handle and use the arrow keys — to set the order crew see on the scanner. Saved as you go.</p>
      )}
      <span className="sr-only">{`Order for ${day}`}</span>
    </div>
  );
}
