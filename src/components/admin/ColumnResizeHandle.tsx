"use client";
import { useRef } from "react";
import { clampWidth, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@/lib/columns";

const STEP = 16;

/**
 * The right edge of a column header, dragged to set the column's width.
 *
 * The drag reports every move through `onResize` so the column follows the pointer, and only
 * `onCommit` saves, once, when it is let go — not a cookie write per pixel. A double-click
 * hands the column back to its contents. A drag is a gesture no keyboard can make, so the
 * handle is also a focusable separator the arrow keys widen and narrow, saving each step,
 * with Home as the keyboard's double-click.
 */
export function ColumnResizeHandle({ label, width, onResize, onCommit, onReset }: {
  label: string;
  /** The dragged width, or undefined while the column is sized by its contents. */
  width: number | undefined;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null);

  // What the column measures right now. A column sized by its contents has no stored
  // width, so the header cell itself is the only place that knows.
  const measured = (el: HTMLElement) => Math.round(el.closest("th")?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuemin={MIN_COLUMN_WIDTH}
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize. Double-click to fit the contents."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const startWidth = measured(e.currentTarget);
        drag.current = { startX: e.clientX, startWidth, last: startWidth };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = clampWidth(d.startWidth + e.clientX - d.startX);
        onResize(d.last);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        // A click without a move is not a resize: saving it would pin an auto column to
        // whatever it happened to measure.
        if (d && d.last !== d.startWidth) onCommit(d.last);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "Home") { e.preventDefault(); onReset(); return; }
        const delta = e.key === "ArrowRight" ? STEP : e.key === "ArrowLeft" ? -STEP : 0;
        if (!delta) return;
        e.preventDefault();
        onCommit(clampWidth((width ?? measured(e.currentTarget)) + delta));
      }}
      className="group/resize absolute inset-y-0 -right-1.5 z-10 flex w-3 cursor-col-resize touch-none justify-center outline-none"
    >
      <span
        aria-hidden="true"
        className="my-2 w-0.5 rounded-full bg-border transition-colors duration-150 group-hover/resize:bg-primary group-focus-visible/resize:bg-primary group-active/resize:bg-primary"
      />
    </div>
  );
}
