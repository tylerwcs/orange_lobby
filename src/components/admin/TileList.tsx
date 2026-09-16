"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import type { EventModule } from "@/lib/modules";
import { moduleId } from "@/lib/modules-form";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";

/** What a row says its tile opens, in the fewest words that are still specific. */
function describe(m: EventModule): string {
  if (m.key === "floor_plan") return m.url ? "Floor plan image" : "No image yet — the tile stays hidden";
  if (m.key !== "tile") return "";
  return m.target.kind === "url" ? m.target.url : `Portal page · ${m.target.route}`;
}

function label(m: EventModule): string {
  if (m.key === "tile") return m.label;
  return m.label ?? "Floor plan";
}

/**
 * The event's tiles, in the order they appear on the portal home.
 *
 * The editing form for each tile is rendered by the server and handed over in `editors`,
 * keyed by id rather than by position — the rows reorder optimistically on the client, so
 * anything zipped by index would attach the wrong form to a row mid-drag.
 */
export function TileList({ items, editors, reorder, remove, toggle }: {
  items: EventModule[];
  editors: Record<string, React.ReactNode>;
  reorder: (ids: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<void>;
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
      setMessage(`${label(moved)} moved to position ${next.indexOf(moved) + 1} of ${next.length}`);
      await reorder(next.map(moduleId));
    });
  };

  if (order.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No tiles yet. Add one and it appears on the portal home.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border" aria-busy={pending}>
        {order.map((m, i) => {
          const id = moduleId(m);
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
              onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
              onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
              onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
              className={`flex flex-wrap items-center gap-3 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
            >
              {/* Same handle as the checkpoint list: focus it and the arrow keys move the
                  row, so the order is reachable without a pointer. */}
              <button
                type="button"
                aria-label={`Reorder ${label(m)}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
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
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-primary">
                <Icon name={m.key === "tile" ? m.icon : "map"} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{label(m)}</span>
                  {!m.enabled && <Badge variant="secondary">Hidden</Badge>}
                  {m.key === "floor_plan" && <Badge variant="secondary">Floor plan</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{describe(m)}</div>
              </div>
              <div className="flex items-center gap-1">
                {editors[id]}
                <form action={() => toggle(id, !m.enabled)}>
                  <SubmitButton variant="ghost">{m.enabled ? "Hide" : "Show"}</SubmitButton>
                </form>
                <form action={() => remove(id)}>
                  <ConfirmButton message={`Remove “${label(m)}” from the portal home?`} className="text-destructive">Remove</ConfirmButton>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="pt-2 text-xs text-muted-foreground">Drag a row by its handle — or focus the handle and use the arrow keys — to set the order on the portal home. Saved as you go.</p>
      )}
    </div>
  );
}
