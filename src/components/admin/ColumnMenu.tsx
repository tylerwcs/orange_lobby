"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ColumnDef } from "@/lib/columns";

type Action = (formData: FormData) => void | Promise<void>;

const item = "flex w-full min-h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm font-semibold text-ink transition-colors duration-150 hover:bg-canvas";

/**
 * The menu behind every column header: hide this one, choose which others to show,
 * rename or delete one of the organiser's own columns, or add another.
 *
 * The panel is `fixed` rather than absolutely placed inside the header cell, because the
 * table scrolls horizontally in its own `overflow` container — an absolutely positioned
 * panel would be clipped by it.
 */
export function ColumnMenu({ column, columns, hidden, onToggle, onAddColumn, renameColumn, deleteColumn }: {
  column: ColumnDef;
  columns: ColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
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
  const [spot, setSpot] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); setRenamingFrom(null); };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    // Keep the panel on screen when the header sits near the right edge.
    setSpot({ left: Math.max(8, Math.min(r.left, window.innerWidth - 288)), top: r.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    // Scrolling moves the header out from under a fixed panel, so the panel goes with it.
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef} type="button" aria-expanded={open} aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 hover:bg-canvas ${open ? "text-brand-ink" : "text-muted"}`}
      >
        {column.label}
        <Icon name="chevron" size={12} className="rotate-90" />
      </button>

      {open && (
        <div
          ref={panelRef} role="group" aria-label={`${column.label} column options`}
          style={{ left: spot.left, top: spot.top }}
          className="fixed z-50 w-70 rounded-[14px] border border-line bg-surface p-2 text-ink shadow-[var(--shadow-card)]"
        >
          <p className="px-2.5 pt-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{column.label}</p>
          {column.source === "registration" && (
            <p className="px-2.5 pb-1.5 text-xs text-muted">Asked on the registration form. Edit the question under Settings.</p>
          )}

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
              {c.label}
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
