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
import { AttendeePanel } from "@/components/admin/AttendeePanel";
import { serialiseTablePrefs, tableCookieName, type ColumnDef, type TablePrefs } from "@/lib/columns";
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

/**
 * Writing the layout back out. Lives outside the component because it touches
 * `document` — a browser API, not React state — and the compiler is right to insist that
 * a render-phase closure not reach for one.
 */
function persistPrefs(eventId: string, prefs: TablePrefs) {
  document.cookie = `${tableCookieName(eventId)}=${serialiseTablePrefs(prefs)}; path=/; max-age=31536000; samesite=lax`;
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
  // columns and nothing flashes in and back out on hydration.
  const [prefs, setPrefs] = useState<TablePrefs>(initialPrefs);
  const [addingColumn, setAddingColumn] = useState(false);

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
  // panel opens on the click rather than a round trip later; once it settles the URL is
  // the truth, which is what closes the panel after a save redirects to the plain list.
  const openId = opensPending ? opening : openAttendeeId;

  // A per-browser preference, not shared state: one organiser's choice of columns must not
  // rearrange the table for the crew member next to them.
  const save = (next: TablePrefs) => {
    setPrefs(next);
    persistPrefs(eventId, next);
  };

  const hidden = new Set(prefs.hidden);
  const shown = columns.filter((c) => !hidden.has(c.key));
  const emailShown = shown.some((c) => c.key === "email");

  const toggleColumn = (key: string, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(key); else next.add(key);
    save({ hidden: Array.from(next) });
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
    setAddingColumn(false);
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

  return (
    <div className="flex flex-col gap-3">
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ColumnsButton
          columns={columns}
          hidden={hidden}
          onToggle={toggleColumn}
          onShowAll={() => save({ hidden: [] })}
          onAddColumn={() => setAddingColumn(true)}
        />
      </div>

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
              <TableHead className="text-xs font-bold uppercase tracking-[0.06em]">Name</TableHead>
              {shown.map((c) => (
                <TableHead key={c.key} className="p-0">
                  <ColumnMenu
                    column={c}
                    onHide={(key) => toggleColumn(key, false)}
                    renameColumn={renameColumn}
                    deleteColumn={deleteColumn}
                  />
                </TableHead>
              ))}
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
                  {/* A real link, so it can be opened in a new tab or copied — but a plain
                      click opens the panel here rather than navigating away from the list. */}
                  <Link
                    href={listHref(a.id)}
                    onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); showPanel(a.id); }}
                    className="font-semibold text-primary hover:underline"
                  >{a.name}</Link>
                  {/* Only when Email is not a column of its own, so ticking it on in the
                      Columns menu does not print the same address twice in one row. */}
                  {!emailShown && a.email && (
                    <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                  )}
                </TableCell>
                {shown.map((c) => <TableCell key={c.key}>{cell(a, c.key)}</TableCell>)}
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
