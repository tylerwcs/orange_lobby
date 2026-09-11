"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ColumnDef } from "@/lib/columns";

type Action = (formData: FormData) => void | Promise<void>;

const item = "flex w-full min-h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm font-semibold text-ink transition-colors duration-150 hover:bg-canvas disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * The menu behind every column header: move it, hide it, choose which others to show,
 * rename or delete one of the organiser's own, or add another.
 *
 * The panel is `fixed` rather than absolutely placed inside the header cell, because the
 * table scrolls horizontally in its own `overflow` container — an absolutely positioned
 * panel would be clipped by it.
 */
export function ColumnMenu({ column, columns, hidden, canMoveLeft, canMoveRight, onMove, onToggle, onResetWidth, onAddColumn, renameColumn, deleteColumn }: {
  column: ColumnDef;
  columns: ColumnDef[];
  hidden: Set<string>;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (key: string, direction: -1 | 1) => void;
  onToggle: (key: string, visible: boolean) => void;
  onResetWidth: (key: string) => void;
  onAddColumn: () => void;
  renameColumn: Action;
  deleteColumn: Action;
}) {
  const [open, setOpen] = useState(false);
  // The label the rename input was opened against. Once the server answers with a
  // different one the rename is done, so `renaming` derives from that rather than
  // being switched off by hand — and the form is never unmounted mid-submit.
  const [renamingFrom, setRenamingFrom] = useState<string | null>(null);
  const renaming = renamingFrom !== null && renamingFrom === column.label;
  const [spot, setSpot] = useState({ left: 0, top: 0, maxHeight: 400 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); setRenamingFrom(null); };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    // The column list can be long. Open downwards when there is room, upwards when there
    // is more of it there, and cap the panel either way so it scrolls inside itself
    // rather than running off the bottom of the window.
    const flip = below < 260 && above > below;
    setSpot({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 288)),
      top: flip ? Math.max(8, r.top - Math.min(above, 520) - 6) : r.bottom + 6,
      maxHeight: Math.max(200, Math.min(flip ? above : below, 520)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    const inPanel = (target: EventTarget | null) => panelRef.current?.contains(target as Node) ?? false;
    const onPointer = (e: PointerEvent) => {
      if (inPanel(e.target) || buttonRef.current?.contains(e.target as Node)) return;
      close();
    };
    // Scrolling the page moves the header out from under a fixed panel, so the panel goes
    // with it — but scrolling *inside* the panel is how you reach the bottom of a long
    // column list, and must not dismiss the thing you are reading.
    const onScroll = (e: Event) => { if (!inPanel(e.target)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef} type="button" aria-expanded={open} aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[8px] px-1.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 hover:bg-canvas ${open ? "text-brand-ink" : "text-muted"}`}
      >
        <span className="truncate">{column.label}</span>
        <Icon name="chevron" size={12} className="shrink-0 rotate-90" />
      </button>

      {open && (
        <div
          ref={panelRef} role="group" aria-label={`${column.label} column options`}
          style={{ left: spot.left, top: spot.top, maxHeight: spot.maxHeight }}
          className="fixed z-50 w-70 overflow-y-auto overscroll-contain rounded-[14px] border border-line bg-surface p-2 text-ink shadow-[var(--shadow-card)]"
        >
          <p className="px-2.5 pt-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{column.label}</p>
          {column.source === "registration" && (
            <p className="px-2.5 pb-1.5 text-xs text-muted">Asked on the registration form. Edit the question under Settings.</p>
          )}

          {/* Dragging a header is quicker, but it is a pointer gesture no keyboard can
              perform, so the same move lives here too. */}
          <button type="button" className={item} disabled={!canMoveLeft} onClick={() => { onMove(column.key, -1); close(); }}>
            <Icon name="chevron" size={16} className="rotate-180 text-muted" />Move left
          </button>
          <button type="button" className={item} disabled={!canMoveRight} onClick={() => { onMove(column.key, 1); close(); }}>
            <Icon name="chevron" size={16} className="text-muted" />Move right
          </button>
          <button type="button" className={item} onClick={() => { onResetWidth(column.key); close(); }}>
            <Icon name="filter" size={16} className="text-muted" />Reset width
          </button>
          <button type="button" className={item} onClick={() => { onToggle(column.key, false); close(); }}>
            <Icon name="close" size={16} className="text-muted" />Hide this column
          </button>

          {column.source === "custom" && (renaming ? (
            <form action={renameColumn} className="flex items-center gap-2 px-1.5 py-1.5">
              <input type="hidden" name="key" value={column.key} />
              <label className="sr-only" htmlFor={`rename-${column.key}`}>New name for {column.label}</label>
              <input
                id={`rename-${column.key}`} name="label" defaultValue={column.label} autoFocus maxLength={40}
                className="min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-sm"
              />
              <button className="min-h-11 shrink-0 rounded-[var(--radius-control)] bg-brand-strong px-3 text-sm font-bold text-white">Save</button>
            </form>
          ) : (
            <>
              <button type="button" className={item} onClick={() => setRenamingFrom(column.label)}>
                <Icon name="file" size={16} className="text-muted" />Rename column
              </button>
              <form action={deleteColumn}>
                <input type="hidden" name="key" value={column.key} />
                <button
                  className={`${item} text-danger-strong`}
                  onClick={(e) => {
                    if (!confirm(`Remove the “${column.label}” column from the table? What people entered is kept, and adding the column back brings it with it.`)) e.preventDefault();
                  }}
                >
                  <Icon name="close" size={16} />Delete column
                </button>
              </form>
            </>
          ))}

          <div className="my-2 h-px bg-line" />
          <p className="px-2.5 pb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">Show columns</p>
          {columns.map((c) => (
            <label key={c.key} className={`${item} cursor-pointer`}>
              <input
                type="checkbox" checked={!hidden.has(c.key)} onChange={(e) => onToggle(c.key, e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">{c.label}</span>
            </label>
          ))}

          <div className="my-2 h-px bg-line" />
          <button type="button" className={`${item} text-brand-ink`} onClick={() => { close(); onAddColumn(); }}>
            <Icon name="plus" size={16} />Add a column…
          </button>
        </div>
      )}
    </>
  );
}
