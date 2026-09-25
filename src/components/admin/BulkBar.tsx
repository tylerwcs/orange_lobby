"use client";
import { useRef, useState, useTransition } from "react";
import { ChevronDown, Download, MoreHorizontal, ScanLine, Trash2, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { Checkpoint } from "@/lib/types";
import { toast } from "@/lib/toast-store";

type TableAction = (formData: FormData) => void | Promise<void>;

/** Dark-bar button face. The bar floats over the page, so it cannot borrow the page's ground. */
const onDark = "bg-white/12 text-white hover:bg-white/20 border-transparent";

/**
 * What you can do to a selection.
 *
 * Fixed to the bottom of the viewport rather than sitting in the page: it used to push the
 * whole table down the moment you ticked one box, which moves the rows you are aiming at.
 * Out of flow, nothing shifts.
 *
 * One row, always. The column editor lives in a Popover and check-in in a DropdownMenu, so
 * two forms and four actions no longer compete for one strip and wrap onto a second line.
 *
 * A breakout round is one of the columns in that editor, not a control of its own: putting
 * someone in a room is the same gesture as setting their table or their category, and the
 * bar has no room for a third form.
 */
export function BulkBar({
  eventId,
  ids,
  onClear,
  setColumn,
  markCheckedIn,
  deleteAttendees,
  fields,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  ids: string[];
  onClear: () => void;
  setColumn: TableAction;
  markCheckedIn: TableAction;
  /** Resolves to how many were deleted, for the toast. */
  deleteAttendees: (formData: FormData) => Promise<number>;
  fields: AttendeeField[];
  checkpoints: Checkpoint[];
  defaultCheckpointId?: string;
}) {
  const [columnKey, setColumnKey] = useState(fields[0]?.key ?? "");
  const [value, setValue] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const editForm = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [checkingIn, startCheckIn] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDeleting] = useTransition();

  if (ids.length === 0) return null;

  const field = fields.find((f) => f.key === columnKey);
  const people = `${ids.length} ${ids.length === 1 ? "attendee" : "attendees"}`;

  // Submitting a blank value clears that column for everyone selected - the one move here
  // that destroys something, and the easiest to trigger by accident.
  const confirmIfClearing = (e: React.FormEvent) => {
    if (confirmed.current) { confirmed.current = false; return; }
    if (value.trim() === "") {
      e.preventDefault();
      setConfirmingClear(true);
    }
  };

  // Built here rather than posted from a hidden form with a ref-held checkpoint: reading a
  // ref during render is exactly what it is not for, and a state-held one would still carry
  // the previous value on the tick the menu item is clicked.
  const checkInAt = (id: string) => {
    const data = new FormData();
    data.set("ids", ids.join(","));
    data.set("checkpoint_id", id);
    startCheckIn(() => { void markCheckedIn(data); });
  };

  // The dialog stays open, busy, until the server answers: closing it on the click would
  // leave a destructive action running with nothing on screen to say so.
  const deleteSelected = () => {
    const data = new FormData();
    data.set("ids", ids.join(","));
    startDeleting(async () => {
      try {
        const n = await deleteAttendees(data);
        toast(`Deleted ${n} ${n === 1 ? "attendee" : "attendees"}.`);
        setConfirmingDelete(false);
        onClear();
      } catch {
        toast("Could not delete them. Nothing was removed; try again.", "error");
      }
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-foreground p-2 pl-4 text-background shadow-[0_16px_38px_-14px_rgba(17,24,39,.6)]">
        <span className="text-sm font-semibold whitespace-nowrap">{ids.length} selected</span>
        <span aria-hidden="true" className="h-5 w-px bg-white/20" />

        {field && (
          <Popover>
            <PopoverTrigger render={<Button size="sm" className={onDark} />}>
              Edit
              <ChevronDown data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent align="center" className="w-72">
              <form ref={editForm} action={setColumn} onSubmit={confirmIfClearing} className="flex flex-col gap-3">
                <input type="hidden" name="ids" value={ids.join(",")} />

                <Field>
                  <FieldLabel htmlFor="bulk-column">Column</FieldLabel>
                  <select
                    id="bulk-column" name="column" value={columnKey}
                    onChange={(e) => { setColumnKey(e.target.value); setValue(""); }}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="bulk-value">New value</FieldLabel>
                  {field.type === "select" ? (
                    <select
                      id="bulk-value" name="value" value={value} onChange={(e) => setValue(e.target.value)}
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">— clear —</option>
                      {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <Input
                      id="bulk-value" name="value" value={value} onChange={(e) => setValue(e.target.value)}
                      type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                      {...(field.type === "number" ? { step: "any", inputMode: "decimal" as const } : {})}
                      placeholder={`Set ${field.label.toLowerCase()}`}
                    />
                  )}
                </Field>

                <SubmitButton className="w-full">Update {people}</SubmitButton>
              </form>
            </PopoverContent>
          </Popover>
        )}

        {checkpoints.length > 0 && (
          <DropdownMenu>
              {/* The menu closes as soon as a door is picked, so the trigger is what says the
                  check-in is still running. */}
              <DropdownMenuTrigger render={<Button size="sm" className={onDark} disabled={checkingIn} aria-busy={checkingIn} />}>
                {checkingIn ? <Spinner data-icon="inline-start" /> : <ScanLine data-icon="inline-start" />}
                {checkingIn ? "Checking in…" : "Check in"}
                <ChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {/* The label belongs INSIDE the group: Base UI throws MenuGroupContext is
                    missing if a group part sits directly under the content, which takes the
                    whole bar down with it. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground">Check {people} in at</DropdownMenuLabel>
                  {checkpoints.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => checkInAt(c.id)}>
                      {c.name}
                      {/* The one the Overview says is running. Naming it here is what stops a
                          bulk check-in landing at a door nobody is working. */}
                      {c.id === defaultCheckpointId && (
                        <span className="ml-auto pl-4 text-xs text-muted-foreground">running</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" aria-label="More actions" className={onDark} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={<a href={`/admin/events/${eventId}/export/attendance.xlsx?ids=${ids.join(",")}`} download />}
            >
              <Download />
              Export {people}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
              <Trash2 />
              Delete {people}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span aria-hidden="true" className="h-5 w-px bg-white/20" />
        <Button
          size="icon-sm" onClick={onClear} aria-label="Clear selection" title="Clear selection"
          className={onDark}
        >
          <X />
        </Button>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={(open) => { if (!deleting) setConfirmingDelete(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {people}?</AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from this event with everything attached to them: check-ins, breakout rooms, activity bookings, submissions and uploaded files. Their personal links stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep them</AlertDialogCancel>
            <Button
              onClick={deleteSelected} disabled={deleting} aria-busy={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Spinner data-icon="inline-start" />}
              {deleting ? "Deleting…" : `Delete ${people}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingClear} onOpenChange={setConfirmingClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {field?.label ?? "this column"} for {people}?</AlertDialogTitle>
            <AlertDialogDescription>
              The value is emptied for every attendee in the selection. Their other details are untouched, and this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the values</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { confirmed.current = true; setConfirmingClear(false); editForm.current?.requestSubmit(); }}
            >
              Clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
