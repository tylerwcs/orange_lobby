"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { CircleAlert } from "lucide-react";
import { TILE_ROUTE_LABELS, type EventModule } from "@/lib/modules";
import { moduleId } from "@/lib/modules-form";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { RowActions, RowMoveContext } from "@/components/admin/RowActions";

function label(m: EventModule): string {
  if (m.key === "tile") return m.label;
  return m.label ?? "Floor plan";
}

/** What kind of tile it is, in the words the "New tile" menu used. */
function kind(m: EventModule): string {
  if (m.key === "floor_plan") return "Floor plan";
  if (m.key === "tile") return m.target.kind === "url" ? "Link" : "Portal page";
  return "Link";
}

/** Where it goes, in the fewest words that are still specific. */
function detail(m: EventModule): string {
  if (m.key === "tile") return m.target.kind === "url" ? m.target.url : TILE_ROUTE_LABELS[m.target.route];
  if (m.key === "link") return m.url;
  return "";
}

function externalUrl(m: EventModule): string | null {
  if (m.key === "tile" && m.target.kind === "url") return m.target.url;
  if (m.key === "link") return m.url;
  return null;
}

/** The tile's own picture at thumbnail size, or its icon on the brand tint, as on the portal. */
function Thumb({ m }: { m: EventModule }) {
  const image = "icon_image" in m ? m.icon_image : undefined;
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="size-11 shrink-0 rounded-lg bg-muted object-contain p-1" />;
  }
  return (
    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon name={m.key === "tile" || m.key === "link" ? m.icon : "map"} size={20} />
    </span>
  );
}

/** The same warning chip as an activity row's (ActivityRows' AttentionBadge). */
function Attention({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
      <CircleAlert aria-hidden className="size-3.5" />{text}
    </span>
  );
}

function ShownPill({ shown }: { shown: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${shown ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground"}`}>
      {shown ? "Shown" : "Hidden"}
    </span>
  );
}

const ROW = "grid grid-cols-[1.75rem_2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 md:grid-cols-[1.75rem_2.75rem_minmax(0,1fr)_5.5rem_5.5rem]";

/**
 * The portal home's round buttons, laid out like the activity list (ActivityList): picture,
 * name and kind, status, and the same two controls, the switch and the menu. Unlike
 * activities the order is the point — it is the order attendees see — so every row keeps a
 * drag handle in front, and the arrow keys move a row when its handle has focus.
 *
 * The edit form for each tile is rendered by the server and handed over in `editors`, keyed
 * by id rather than position: rows reorder optimistically, and anything zipped by index would
 * attach the wrong form to a row mid-drag.
 */
export function ModuleList({ items, editors, reorder, remove, toggle }: {
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
    return <p className="px-4 py-6 text-sm text-muted-foreground">No tiles yet. Add one and it appears on the portal home.</p>;
  }

  return (
    <div>
      <div role="table" aria-label="Tiles" aria-busy={pending}>
        <div role="row" className={`${ROW} hidden border-b py-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground md:grid`}>
          {/* Real cells, not sr-only: sr-only drops out of the grid (see ActivityList). */}
          <span role="columnheader" aria-label="Order" />
          <span role="columnheader" aria-label="Picture" />
          <span role="columnheader">Tile</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Shown</span>
        </div>
        {order.map((m, i) => {
          const id = moduleId(m);
          return (
            <div
              key={id}
              role="row"
              draggable
              onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
              onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
              onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
              onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
              className={`${ROW} border-b py-3 transition-colors duration-150 last:border-b-0 hover:bg-muted/40 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
            >
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
              <Thumb m={m} />
              <RowMoveContext.Provider value={{ up: i > 0 ? () => move(i, i - 1) : null, down: i < order.length - 1 ? () => move(i, i + 1) : null }}>
                <Row m={m} editor={editors[id]} toggle={() => toggle(id, !m.enabled)} remove={() => remove(id)} />
              </RowMoveContext.Provider>
            </div>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Drag a row by its handle — or focus the handle and use the arrow keys, or use Move up and Move down in its menu — to set the order on the portal home. Saved as you go.</p>
      )}
    </div>
  );
}

/** The name, status and controls of one row; the edit dialog opens from the name or the menu. */
function Row({ m, editor, toggle, remove }: { m: EventModule; editor: React.ReactNode; toggle: () => Promise<void>; remove: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const name = label(m);
  const url = externalUrl(m);
  const where = detail(m);
  const planMissing = m.key === "floor_plan" && !m.url;

  return (
    <>
      <div role="cell" className="flex min-w-0 flex-col gap-1">
        <button type="button" onClick={() => setEditing(true)} className="w-fit max-w-full truncate text-left font-bold outline-none hover:underline focus-visible:underline">
          {name}
        </button>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-bold">{kind(m)}</span>
          {where && <span className="truncate">{where}</span>}
          {planMissing && <Attention text="No image yet — hidden from attendees" />}
        </div>
        {/* Phone only: status folds under the name. */}
        <div className="md:hidden"><ShownPill shown={m.enabled} /></div>
      </div>
      <div role="cell" className="hidden md:block"><ShownPill shown={m.enabled} /></div>
      <div role="cell" className="flex items-center justify-end gap-2 md:justify-start">
        <OpenSwitch open={m.enabled} action={toggle} name={name} verb="Show" />
        <RowActions
          name={name}
          edit={{ title: `Edit ${name}`, form: editor }}
          editOpen={editing}
          onEditOpenChange={setEditing}
          links={url ? [{ label: "Open link", href: url, newTab: true }] : []}
          remove={{ action: remove, label: "Remove", message: "It comes off the portal home straight away. Add it again any time from New tile." }}
        />
      </div>
    </>
  );
}
