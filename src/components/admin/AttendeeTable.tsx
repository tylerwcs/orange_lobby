"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { isoToLocalInput } from "@/lib/time";
import { BulkBar } from "@/components/admin/BulkBar";
import { ColumnMenu } from "@/components/admin/ColumnMenu";
import { AttendeeDialog } from "@/components/admin/AttendeeDialog";
import { Icon } from "@/components/ui/Icon";
import { moveItem } from "@/lib/reorder";
import {
  columnWidth, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, orderedColumns,
  SELECT_COLUMN_WIDTH, serialiseTablePrefs, tableCookieName, type ColumnDef, type TablePrefs,
} from "@/lib/columns";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { AttendeeSource, Checkpoint } from "@/lib/types";

// Exactly the fields this table renders — never the full `Attendee` shape, which carries
// `token` (the bearer credential for the attendee portal link) and `phone`. `values` holds
// only the event's *defined* columns, so an unmapped key an import left behind in `extra`
// stays on the server.
export type AttendeeRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  category: string | null;
  table_no: string | null;
  source: AttendeeSource;
  checkedInAt: string | null;
  values: Record<string, string>;
};

type TableAction = (formData: FormData) => void | Promise<void>;

function HeaderCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
      <span className="sr-only">Select all attendees on this page</span>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function cell(a: AttendeeRow, key: string) {
  switch (key) {
    case "email": return a.email;
    case "company": return a.company;
    case "category": return a.category;
    case "table_no": return a.table_no;
    case "source": return <span className="text-muted">{a.source}</span>;
    case "checked_in":
      return a.checkedInAt
        ? <Badge tone="ok" dot>In {isoToLocalInput(a.checkedInAt).split("T")[1]}</Badge>
        : <Badge tone="warn" dot>Expected</Badge>;
    default: return a.values[key] || <span className="text-muted">—</span>;
  }
}

/**
 * Writing the layout back out. Lives outside the component because it touches
 * `document` — a browser API, not React state — and the compiler is right to insist that
 * a render-phase closure not reach for one.
 */
function persistPrefs(eventId: string, prefs: TablePrefs) {
  document.cookie = `${tableCookieName(eventId)}=${serialiseTablePrefs(prefs)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The grab strip on a column's right edge. `draggable={false}` matters: without it the
 * header's own reorder drag starts the moment you try to resize, and the column jumps
 * somewhere else instead of getting wider.
 */
function ResizeHandle({ onPointerDown, label }: { onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => void; label: string }) {
  return (
    <span
      role="separator" aria-orientation="vertical" aria-label={`Resize ${label} column`}
      draggable={false} onPointerDown={onPointerDown} onDragStart={(e) => e.preventDefault()}
      className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none border-r-2 border-transparent hover:border-brand"
    />
  );
}

export function AttendeeTable({
  eventId,
  rows,
  columns,
  initialPrefs,
  openAttendeeId,
  detailPanel,
  emptyMessage,
  setColumn,
  markCheckedIn,
  bulkEditable,
  renameColumn,
  deleteColumn,
  addColumnForm,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  rows: AttendeeRow[];
  columns: ColumnDef[];
  initialPrefs: TablePrefs;
  /** The attendee the URL says is open, and the server-rendered panel for them. */
  openAttendeeId: string | null;
  detailPanel: React.ReactNode;
  emptyMessage: string;
  setColumn: TableAction;
  markCheckedIn: TableAction;
  bulkEditable: AttendeeField[];
  renameColumn: TableAction;
  deleteColumn: TableAction;
  addColumnForm: React.ReactNode;
  checkpoints: Checkpoint[];
  defaultCheckpointId?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Bumped after every successful bulk submit so BulkBar remounts fresh — clearing
  // both the selection (below) and its own inputs, which would otherwise survive since
  // BulkBar merely renders null while `selected` is empty.
  const [bulkVersion, setBulkVersion] = useState(0);
  // Seeded from the cookie on the server, so the first paint already has the right
  // columns at the right widths and nothing flashes in and back out on hydration.
  const [prefs, setPrefs] = useState<TablePrefs>(initialPrefs);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const addRef = useRef<HTMLDialogElement>(null);

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [opening, setOpening] = useState<string | null>(null);
  const [opensPending, startOpening] = useTransition();

  /** The same list, with or without an attendee open — so the search and page survive. */
  const listHref = (attendeeId: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (attendeeId) next.set("attendee", attendeeId); else next.delete("attendee");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const showPanel = (attendeeId: string | null) => {
    setOpening(attendeeId);
    startOpening(() => router.push(listHref(attendeeId), { scroll: false }));
  };

  // Derived, not synced: while the navigation is in flight the local choice wins, so the
  // dialog opens on the click rather than a round trip later; once it settles the URL is
  // the truth, which is what closes the panel after a save redirects to the plain list.
  const openId = opensPending ? opening : openAttendeeId;

  // A per-browser preference, not shared state: one organiser's layout must not rearrange
  // the table for the crew member next to them.
  const save = (next: TablePrefs) => {
    setPrefs(next);
    persistPrefs(eventId, next);
  };

  const ordered = orderedColumns(columns, prefs.order);
  const hidden = new Set(prefs.hidden);
  const shown = ordered.filter((c) => !hidden.has(c.key));
  const hiddenCount = ordered.length - shown.length;
  const width = (key: string) => columnWidth(key, prefs.widths);
  const customised = prefs.order.length > 0 || prefs.hidden.length > 0 || Object.keys(prefs.widths).length > 0;

  const toggleColumn = (key: string, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(key); else next.add(key);
    save({ ...prefs, hidden: Array.from(next) });
  };

  const resetWidth = (key: string) => {
    const widths = { ...prefs.widths };
    delete widths[key];
    save({ ...prefs, widths });
  };

  /** Both routes into a reorder — the drag and the menu — go through here, so they cannot drift apart. */
  const moveTo = (key: string, targetKey: string) => {
    const keys = ordered.map((c) => c.key);
    const from = keys.indexOf(key);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0 || from === to) return;
    const label = ordered[from].label;
    const next = moveItem(keys, from, to);
    save({ ...prefs, order: next });
    setMessage(`${label} moved to position ${next.indexOf(key) + 1} of ${next.length}`);
  };

  /** One place among the columns you can see — stepping over a hidden one would look like nothing happened. */
  const moveBy = (key: string, direction: -1 | 1) => {
    const visible = shown.map((c) => c.key);
    const target = visible[visible.indexOf(key) + direction];
    if (target) moveTo(key, target);
  };

  const startResize = (key: string, e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width(key);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let latest = startWidth;

    const onMove = (ev: PointerEvent) => {
      latest = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, startWidth + ev.clientX - startX));
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [key]: latest } }));
    };
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      // Written once at the end rather than on every pointer move — a drag would otherwise
      // rewrite the cookie a hundred times on the way across the screen.
      save({ ...prefs, widths: { ...prefs.widths, [key]: latest } });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const runBulk = (action: TableAction): TableAction => async (formData) => {
    await action(formData);
    setSelected(new Set());
    setBulkVersion((v) => v + 1);
  };

  // Adding a column redirects back to this same URL, so nothing unmounts the dialog and
  // nothing changes in the address bar. The new column arriving is the signal that the
  // task finished.
  const columnCount = columns.length;
  const lastCount = useRef(columnCount);
  useEffect(() => {
    if (lastCount.current === columnCount) return;
    lastCount.current = columnCount;
    addRef.current?.close();
  }, [columnCount]);

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((a) => a.id)) : new Set());
  };

  const selectedOnPage = rows.filter((a) => selected.has(a.id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;
  const someSelected = selectedOnPage > 0 && !allSelected;
  const tableWidth = SELECT_COLUMN_WIDTH + width("name") + shown.reduce((n, c) => n + width(c.key), 0);

  return (
    <div className="space-y-3">
      <BulkBar
        key={bulkVersion}
        eventId={eventId}
        ids={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        setColumn={runBulk(setColumn)}
        markCheckedIn={runBulk(markCheckedIn)}
        fields={bulkEditable}
        checkpoints={checkpoints}
        defaultCheckpointId={defaultCheckpointId}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {hiddenCount > 0
            ? `${hiddenCount} ${hiddenCount === 1 ? "column is" : "columns are"} hidden. Drag a header to reorder it, drag its edge to resize.`
            : "Drag a header to reorder it, drag its edge to resize. Every header opens a menu."}
        </p>
        <div className="flex items-center gap-2">
          {customised && (
            <button type="button" onClick={() => save({ hidden: [], order: [], widths: {} })}
              className="min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-bold text-muted transition-colors duration-150 hover:bg-canvas">
              Reset layout
            </button>
          )}
          <button type="button" onClick={() => addRef.current?.showModal()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-bold text-ink transition-colors duration-150 hover:bg-canvas">
            <Icon name="plus" size={18} />Add a column
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
        {/* `table-fixed` plus a colgroup is what makes a width mean something: under
            automatic layout the browser overrules whatever you set the moment a cell holds
            a long email address. Cells clip instead of pushing their neighbours around. */}
        <table className="w-full table-fixed text-sm" style={{ minWidth: tableWidth }}>
          <colgroup>
            <col style={{ width: SELECT_COLUMN_WIDTH }} />
            <col style={{ width: width("name") }} />
            {shown.map((c) => <col key={c.key} style={{ width: width(c.key) }} />)}
          </colgroup>
          <thead>
            <tr className="text-left">
              <th className="p-2">
                <HeaderCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
              </th>
              <th className="relative p-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Name
                <ResizeHandle onPointerDown={(e) => startResize("name", e)} label="Name" />
              </th>
              {shown.map((c, i) => (
                <th
                  key={c.key}
                  draggable
                  onDragStart={(e) => { setDragKey(c.key); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverKey(c.key); }}
                  onDragLeave={() => setOverKey((prev) => (prev === c.key ? null : prev))}
                  onDrop={(e) => { e.preventDefault(); if (dragKey) moveTo(dragKey, c.key); setDragKey(null); setOverKey(null); }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                  className={`relative cursor-grab px-0.5 py-2 transition-colors duration-150 ${dragKey === c.key ? "opacity-50" : ""} ${overKey === c.key && dragKey !== c.key ? "bg-brand-soft" : ""}`}
                >
                  <ColumnMenu
                    column={c} columns={ordered} hidden={hidden}
                    canMoveLeft={i > 0} canMoveRight={i < shown.length - 1}
                    onMove={moveBy}
                    onToggle={toggleColumn}
                    onResetWidth={resetWidth}
                    onAddColumn={() => addRef.current?.showModal()}
                    renameColumn={renameColumn}
                    deleteColumn={deleteColumn}
                  />
                  <ResizeHandle onPointerDown={(e) => startResize(c.key, e)} label={c.label} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="p-0">
                  <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                    <span className="sr-only">Select {a.name}</span>
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={(e) => toggleOne(a.id, e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                </td>
                <td className="truncate p-2">
                  {/* A real link, so it can be opened in a new tab or copied — but a plain
                      click opens the panel here rather than navigating away from the list. */}
                  <Link
                    href={listHref(a.id)}
                    onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); showPanel(a.id); }}
                    className="font-semibold text-brand-ink"
                  >{a.name}</Link>
                </td>
                {shown.map((c) => <td key={c.key} className="truncate p-2">{cell(a, c.key)}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr className="border-t border-line"><td colSpan={shown.length + 2} className="p-6 text-center text-muted">{emptyMessage}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>

      <AttendeeDialog openId={openId} pending={opensPending} onClose={() => showPanel(null)}>
        {detailPanel}
      </AttendeeDialog>

      {/* `m-auto` is load-bearing — see Modal.tsx: Tailwind's preflight zeroes the margin
          a dialog centres itself with. */}
      <dialog
        ref={addRef} aria-label="Add a column"
        onClick={(e) => { if (e.target === addRef.current) addRef.current?.close(); }}
        className="m-auto w-[min(92vw,520px)] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-[var(--shadow-card)] backdrop:bg-ink/40"
      >
        <div className="flex items-start gap-4 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold">Add a column</h2>
            <p className="mt-1 text-sm text-muted">For what the registration form never asked — a room number, a flight. Every form question is already a column. Whatever you add here appears on every attendee, in their details, and in the attendance export.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => addRef.current?.close()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors duration-150 hover:bg-canvas">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="p-5">{addColumnForm}</div>
      </dialog>
    </div>
  );
}
