"use client";
import { useRef, useState } from "react";
import { Check, Download, ScanLine, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { Checkpoint } from "@/lib/types";

type TableAction = (formData: FormData) => void | Promise<void>;

const control = "min-h-11 rounded-md bg-white/10 px-3 text-sm font-bold text-white placeholder:text-white/60";
const action = "inline-flex min-h-11 items-center gap-2 rounded-md bg-white/15 px-3.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-white/25";
const icon = "flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors duration-150 hover:bg-white/15 hover:text-white";

/**
 * What you can do to a selection, in one line. It used to be five buttons — assign table,
 * clear table, mark checked in, export, clear — which is five things to read every time
 * and only ever one of them wanted.
 *
 * Now there is one editor: pick a column, type the value, apply. The control changes with
 * the column, so a date column gets a date picker and a choice column its own list rather
 * than a free-text box that quietly accepts a typo.
 */
export function BulkBar({
  eventId,
  ids,
  onClear,
  setColumn,
  markCheckedIn,
  fields,
  checkpoints,
  defaultCheckpointId,
}: {
  eventId: string;
  ids: string[];
  onClear: () => void;
  setColumn: TableAction;
  markCheckedIn: TableAction;
  fields: AttendeeField[];
  checkpoints: Checkpoint[];
  defaultCheckpointId?: string;
}) {
  const [columnKey, setColumnKey] = useState(fields[0]?.key ?? "");
  const [value, setValue] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  if (ids.length === 0) return null;

  const field = fields.find((f) => f.key === columnKey);
  const people = `${ids.length} ${ids.length === 1 ? "attendee" : "attendees"}`;

  // Clearing a column for a whole selection is the one move here that destroys something,
  // and a blank box is easy to submit by accident. It is also the only way to clear, so it
  // asks rather than being forbidden.
  const confirmIfClearing = (e: React.FormEvent) => {
    if (confirmed.current) { confirmed.current = false; return; }
    if (value.trim() === "") {
      e.preventDefault();
      setConfirmingClear(true);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-foreground p-2.5 text-white">
      <span className="px-1.5 text-[13px] font-extrabold">{ids.length} selected</span>

      {field && (
        <form ref={formRef} action={setColumn} onSubmit={confirmIfClearing} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <label htmlFor="bulk-column" className="sr-only">Column to update</label>
          <select id="bulk-column" name="column" value={columnKey}
            onChange={(e) => { setColumnKey(e.target.value); setValue(""); }} className={control}>
            {fields.map((f) => <option key={f.key} value={f.key} className="text-foreground">{f.label}</option>)}
          </select>

          <label htmlFor="bulk-value" className="sr-only">New value for {field.label}</label>
          {field.type === "select" ? (
            <select id="bulk-value" name="value" value={value} onChange={(e) => setValue(e.target.value)} className={`${control} min-w-40`}>
              <option value="" className="text-foreground">— clear —</option>
              {(field.options ?? []).map((o) => <option key={o} value={o} className="text-foreground">{o}</option>)}
            </select>
          ) : (
            <input
              id="bulk-value" name="value" value={value} onChange={(e) => setValue(e.target.value)}
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              {...(field.type === "number" ? { step: "any", inputMode: "decimal" as const } : {})}
              placeholder={`Set ${field.label.toLowerCase()}`}
              className={`${control} w-44`}
            />
          )}

          <button className={action}><Check className="size-4" />Update</button>
        </form>
      )}

      {checkpoints.length > 0 && (
        <form action={markCheckedIn} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <label htmlFor="bulk-checkpoint" className="sr-only">Checkpoint to check them in at</label>
          <select id="bulk-checkpoint" name="checkpoint_id" defaultValue={defaultCheckpointId} className={control}>
            {checkpoints.map((c) => <option key={c.id} value={c.id} className="text-foreground">{c.name}</option>)}
          </select>
          <button className={action}><ScanLine className="size-4" />Check in</button>
        </form>
      )}

      <span className="flex-1" />

      <a href={`/admin/events/${eventId}/export/attendance.xlsx?ids=${ids.join(",")}`} download
        title={`Export ${people}`} aria-label={`Export ${people}`} className={icon}>
        <Download className="size-4" />
      </a>
      <button type="button" onClick={onClear} title="Clear selection" aria-label="Clear selection" className={icon}>
        <X className="size-4" />
      </button>

      {/* Submitting a blank value clears the column for everyone selected - the one move
          here that destroys something, and the easiest to trigger by accident. It used to
          ask through window.confirm, which some browsers suppress outright; a suppressed
          confirm means the clear just happens. */}
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
              onClick={() => { confirmed.current = true; setConfirmingClear(false); formRef.current?.requestSubmit(); }}
            >
              Clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
