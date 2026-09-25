"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { isoToLocalInput } from "@/lib/time";
import { BulkBar } from "@/components/admin/BulkBar";
import { ColumnMenu } from "@/components/admin/ColumnMenu";
import { ColumnsButton } from "@/components/admin/ColumnsButton";
import { ColumnResizeHandle } from "@/components/admin/ColumnResizeHandle";
import { SortableList } from "@/components/admin/SortableList";
import { AttendeePanel } from "@/components/admin/AttendeePanel";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { orderedColumns, type ColumnDef, type TablePrefs } from "@/lib/columns";
import { writeTablePrefs } from "@/lib/table-prefs-cookie";
import type { Sort, SortDir } from "@/lib/attendee-sort";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { AttendeeSource, Checkpoint } from "@/lib/types";

// Exactly the fields this table renders — never the full `Attendee` shape, which carries
// `token` (the bearer credential for the attendee portal link) and `extra` unfiltered.
// `values` holds only the event's *defined* columns, so an unmapped key an import left
// behind in `extra` stays on the server.
export type AttendeeRow = {
  id: string;
  name: string;
  email: string | null;
  category: string | null;
  source: AttendeeSource;
  checkedInAt: string | null;
  values: Record<string, string>;
};

type TableAction = (formData: FormData) => void | Promise<void>;

function cell(a: AttendeeRow, key: string) {
  switch (key) {
    case "email": return a.email;
    case "category": return a.category;
    // company, phone and table_no are fields now — they arrive through `values`, which is
    // built from the event's fields, exactly like Dietary.
    case "source": return <span className="text-muted-foreground">{a.source}</span>;
    case "checked_in":
      return a.checkedInAt
        ? <Badge variant="success">In {isoToLocalInput(a.checkedInAt).split("T")[1]}</Badge>
        : <Badge variant="warning">Expected</Badge>;
    default: return a.values[key] || <span className="text-muted-foreground">—</span>;
  }
}

/** The whole text of a cell, for the tooltip a narrowed column cuts it off behind. */
function cellText(a: AttendeeRow, key: string): string | undefined {
  if (key === "email") return a.email ?? undefined;
  if (key === "category") return a.category ?? undefined;
  return a.values[key] || undefined;
}

/**
 * A cell's padding, which a dragged width has to leave room for: the width is the whole
 * column, as the header measures it, and the text sits inside the padding.
 */
const CELL_PADDING = 16;


export function AttendeeTable({
  eventId,
  rows,
  allIds,
  searchQuery,
  sort,
  columns,
  initialPrefs,
  openAttendeeId,
  detailPanel,
  emptyMessage,
  setColumn,
  markCheckedIn,
  deleteAttendees,
  bulkEditable,
  renameColumn,
  deleteColumn,
  addColumnForm,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  rows: AttendeeRow[];
  /** Every attendee the current search matches, on every page — what "Select all" reaches. */
  allIds: string[];
  searchQuery: string | null;
  /** The sort the URL asked for, already applied by the server; null means the default name order. */
  sort: Sort | null;
  columns: ColumnDef[];
  initialPrefs: TablePrefs;
  /** The attendee the URL says is open, and the server-rendered panel for them. */
  openAttendeeId: string | null;
  detailPanel: React.ReactNode;
  emptyMessage: string;
  setColumn: TableAction;
  markCheckedIn: TableAction;
  deleteAttendees: (formData: FormData) => Promise<number>;
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
  // columns and nothing flashes in and back out on hydration.
  const [prefs, setPrefs] = useState<TablePrefs>(initialPrefs);
  const [addingColumn, setAddingColumn] = useState(false);
  const [arranging, setArranging] = useState(false);
  // Columns ticked for deletion in the Manage columns dialog, deleted together on confirm (D248).
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The width a column is being dragged to. Held apart from `prefs` so the column follows
  // the pointer without a cookie write per pixel; letting go saves it.
  const [dragging, setDragging] = useState<{ key: string; width: number } | null>(null);

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

  // Sorting is a URL change, because the server sorts the whole list before cutting it into
  // pages. Back to page 1, since the rows on page 3 of the old order mean nothing in the new one.
  const sortBy = (key: string, dir: SortDir | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (dir) { next.set("sort", key); next.set("dir", dir); } else { next.delete("sort"); next.delete("dir"); }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const sortedBy = (key: string): SortDir | null => (sort?.key === key ? sort.dir : null);
  const nameSort = sortedBy("name");

  // Derived, not synced: while the navigation is in flight the local choice wins, so the
  // panel opens on the click rather than a round trip later; once it settles the URL is
  // the truth, which is what closes the panel after a save redirects to the plain list.
  const openId = opensPending ? opening : openAttendeeId;

  // A per-browser preference, not shared state: one organiser's choice of columns must not
  // rearrange the table for the crew member next to them.
  const save = (change: Partial<TablePrefs>) => {
    setPrefs({ ...prefs, ...change });
    // Only what changed, merged into what is stored: the page-size picker writes the same
    // cookie, and a whole-object write from here would put its old value back.
    writeTablePrefs(eventId, initialPrefs, change);
  };

  const hidden = new Set(prefs.hidden);
  const ordered = orderedColumns(columns, prefs.order);
  const shown = ordered.filter((c) => !hidden.has(c.key));
  const emailShown = shown.some((c) => c.key === "email");
  const widthOf = (key: string) => (dragging?.key === key ? dragging.width : prefs.widths[key]);
  const nameWidth = widthOf("name");
  const layoutChanged = prefs.order.length > 0 || Object.keys(prefs.widths).length > 0;

  const toggleColumn = (key: string, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(key); else next.add(key);
    save({ hidden: Array.from(next) });
  };

  const setWidth = (key: string, width: number | undefined) => {
    setDragging(null);
    const widths = { ...prefs.widths };
    if (width === undefined) delete widths[key]; else widths[key] = width;
    save({ widths });
  };

  const runBulk = (action: TableAction): TableAction => async (formData) => {
    await action(formData);
    setSelected(new Set());
    setBulkVersion((v) => v + 1);
  };

  // Adding or deleting a column redirects back to this same URL, so nothing unmounts the
  // dialogs and nothing changes in the address bar. The column count changing is the signal
  // that the task finished.
  const columnCount = columns.length;
  const lastCount = useRef(columnCount);
  useEffect(() => {
    if (lastCount.current === columnCount) return;
    lastCount.current = columnCount;
    setAddingColumn(false);
    setConfirmingDelete(false);
    setArranging(false);
    setMarked(new Set());
  }, [columnCount]);

  const toggleMarked = (key: string) => setMarked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const markedLabels = columns.filter((c) => marked.has(c.key)).map((c) => c.label);

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
  // The offer to reach past this page, once the page itself is fully ticked. Only when there
  // is more than one page's worth: on a single page, the header checkbox already is "all".
  const everyone = allIds.length;
  const matching = searchQuery ? `all ${everyone} matching “${searchQuery}”` : `all ${everyone} attendees`;
  const offerAll = allSelected && everyone > rows.length;
  const everyoneSelected = offerAll && allIds.every((id) => selected.has(id));

  return (
    <div className="flex flex-col gap-3">
      <BulkBar
        key={bulkVersion}
        eventId={eventId}
        ids={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        setColumn={runBulk(setColumn)}
        markCheckedIn={runBulk(markCheckedIn)}
        deleteAttendees={deleteAttendees}
        fields={bulkEditable}
        checkpoints={checkpoints}
        defaultCheckpointId={defaultCheckpointId}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ColumnsButton
          columns={ordered}
          hidden={hidden}
          onToggle={toggleColumn}
          onShowAll={() => save({ hidden: [] })}
          onArrange={() => setArranging(true)}
          onAddColumn={() => setAddingColumn(true)}
        />
      </div>

      {offerAll && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg bg-accent px-4 py-2 text-sm">
          {everyoneSelected ? (
            <>
              <span>All {everyone}{searchQuery ? ` matching “${searchQuery}”` : " attendees"} are selected.</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setSelected(new Set())}>Clear selection</Button>
            </>
          ) : (
            <>
              <span>All {selectedOnPage} on this page are selected.</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setSelected(new Set(allIds))}>Select {matching}</Button>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-11">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Select all attendees on this page"
                />
              </TableHead>
              <TableHead
                className="relative text-xs font-bold uppercase tracking-[0.06em]"
                style={nameWidth ? { width: nameWidth, minWidth: nameWidth, maxWidth: nameWidth } : undefined}
                aria-sort={nameSort === "asc" ? "ascending" : nameSort === "desc" ? "descending" : undefined}
              >
                {/* Name has no menu (it cannot be hidden or renamed), so its header sorts on a
                    click: A→Z, then Z→A, then A→Z again. */}
                <button
                  type="button"
                  onClick={() => sortBy("name", nameSort === "asc" ? "desc" : "asc")}
                  className="inline-flex items-center gap-1 rounded-md text-xs font-bold uppercase tracking-[0.06em] hover:text-foreground"
                  title="Sort by name"
                >
                  Name
                  {nameSort && <span aria-hidden="true">{nameSort === "asc" ? "↑" : "↓"}</span>}
                </button>
                <ColumnResizeHandle
                  label="Name"
                  width={nameWidth}
                  onResize={(w) => setDragging({ key: "name", width: w })}
                  onCommit={(w) => setWidth("name", w)}
                  onReset={() => setWidth("name", undefined)}
                />
              </TableHead>
              {shown.map((c) => {
                const width = widthOf(c.key);
                return (
                  <TableHead
                    key={c.key} className="relative p-0" style={width ? { width, minWidth: width, maxWidth: width } : undefined}
                    aria-sort={sortedBy(c.key) === "asc" ? "ascending" : sortedBy(c.key) === "desc" ? "descending" : undefined}
                  >
                    <div className={width ? "overflow-hidden pl-2" : "pl-2"} style={width ? { width } : undefined}>
                      <ColumnMenu
                        column={c}
                        clip={!!width}
                        sorted={sortedBy(c.key)}
                        onSort={(dir) => sortBy(c.key, dir)}
                        onHide={(key) => toggleColumn(key, false)}
                        onResetWidth={prefs.widths[c.key] ? () => setWidth(c.key, undefined) : undefined}
                        renameColumn={renameColumn}
                        deleteColumn={deleteColumn}
                      />
                    </div>
                    <ColumnResizeHandle
                      label={c.label}
                      width={width}
                      onResize={(w) => setDragging({ key: c.key, width: w })}
                      onCommit={(w) => setWidth(c.key, w)}
                      onReset={() => setWidth(c.key, undefined)}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id} data-state={selected.has(a.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(a.id)}
                    onCheckedChange={(checked) => toggleOne(a.id, checked === true)}
                    aria-label={`Select ${a.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div style={nameWidth ? { width: nameWidth - CELL_PADDING } : undefined}>
                    {/* A real link, so it can be opened in a new tab or copied — but a plain
                        click opens the panel here rather than navigating away from the list. */}
                    <Link
                      href={listHref(a.id)}
                      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); showPanel(a.id); }}
                      title={nameWidth ? a.name : undefined}
                      className={`font-semibold text-primary hover:underline ${nameWidth ? "block truncate" : ""}`}
                    >{a.name}</Link>
                    {/* Only when Email is not a column of its own, so ticking it on in the
                        Columns menu does not print the same address twice in one row. */}
                    {!emailShown && a.email && (
                      <span className="block truncate text-xs text-muted-foreground" title={nameWidth ? a.email : undefined}>{a.email}</span>
                    )}
                  </div>
                </TableCell>
                {shown.map((c) => {
                  const width = widthOf(c.key);
                  if (!width) return <TableCell key={c.key}>{cell(a, c.key)}</TableCell>;
                  // Cut off at the column's edge, with the whole value a hover away.
                  return (
                    <TableCell key={c.key}>
                      <div className="truncate" style={{ width: width - CELL_PADDING }} title={cellText(a, c.key)}>{cell(a, c.key)}</div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={shown.length + 2}>
                  <Empty className="border-0 bg-transparent">
                    <EmptyHeader>
                      <EmptyTitle>Nobody here yet</EmptyTitle>
                      <EmptyDescription>{emptyMessage}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AttendeePanel openId={openId} pending={opensPending} onClose={() => showPanel(null)}>
        {detailPanel}
      </AttendeePanel>

      {/* While columns are marked, a click outside does not close the dialog: the marks would be
          lost, and the confirm swaps the button being clicked for another, which the dialog
          otherwise reads as a click outside. The close button and Escape still work. */}
      <Dialog
        open={arranging}
        disablePointerDismissal={marked.size > 0}
        onOpenChange={(open) => { setArranging(open); if (!open) { setMarked(new Set()); setConfirmingDelete(false); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage columns</DialogTitle>
            <DialogDescription>
              Name always comes first. Order and ticks are saved on this browser only. Deleting a column removes it for everyone, with everything stored in it.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
            <SortableList
              rows={ordered.map((c) => {
                const doomed = marked.has(c.key);
                return {
                  key: c.key,
                  label: c.label,
                  node: (
                    <div className="flex min-h-11 items-center gap-3 text-sm">
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <Checkbox
                          checked={!hidden.has(c.key)}
                          onCheckedChange={(checked) => toggleColumn(c.key, checked === true)}
                          aria-label={`Show ${c.label}`}
                          disabled={doomed}
                        />
                        <span className={`truncate ${doomed ? "text-muted-foreground line-through" : hidden.has(c.key) ? "text-muted-foreground" : "font-semibold"}`}>{c.label}</span>
                      </label>
                      {/* Only a column the organiser or an import added: a registration question
                          belongs to the form in Settings, a built-in to the attendee row, a
                          round to the agenda. */}
                      {c.source === "custom" && (doomed ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => toggleMarked(c.key)}>Undo</Button>
                      ) : (
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${c.label}`} title="Delete column" onClick={() => toggleMarked(c.key)}>
                          <Trash2 />
                        </Button>
                      ))}
                    </div>
                  ),
                };
              })}
              reorder={async (keys) => save({ order: keys })}
              empty="No columns to arrange."
              hint="Drag a column by its handle, use the arrows, or focus the handle and use the arrow keys. Tick a column to show it. Saved as you go."
            />
          </div>
          {/* The confirmation is inline rather than a second modal: two modals at one z-index
              put the second underneath, and closing one counted as a click outside the other. */}
          {confirmingDelete && marked.size > 0 ? (
            <div role="alert" className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p>
                <span className="font-bold">{markedLabels.join(", ")}</span> {marked.size === 1 ? "is" : "are"} removed for everyone, and every attendee&apos;s value in {marked.size === 1 ? "it is" : "them is"} erased. They leave the attendance export too. This can&apos;t be undone.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>Keep them</Button>
                <form action={deleteColumn}>
                  {[...marked].map((k) => <input key={k} type="hidden" name="key" value={k} />)}
                  <SubmitButton className="bg-destructive text-white hover:bg-destructive/90">
                    Delete {marked.size === 1 ? "column" : `${marked.size} columns`}
                  </SubmitButton>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {layoutChanged && (
                <Button variant="ghost" onClick={() => save({ order: [], widths: {} })}>Reset order and widths</Button>
              )}
              {marked.size > 0 && (
                <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
                  Delete {marked.size} column{marked.size === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addingColumn} onOpenChange={setAddingColumn}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a column</DialogTitle>
            <DialogDescription>
              For what the registration form never asked — a room number, a flight. Every form question is already a column. Whatever you add here appears on every attendee, in their details, and in the attendance export.
            </DialogDescription>
          </DialogHeader>
          {addColumnForm}
        </DialogContent>
      </Dialog>
    </div>
  );
}
