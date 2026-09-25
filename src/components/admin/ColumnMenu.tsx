"use client";
import { useState } from "react";
import { ChevronDown, EyeOff, MoveHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import type { ColumnDef } from "@/lib/columns";

type Action = (formData: FormData) => void | Promise<void>;

/**
 * The menu behind a column header: the handful of things that are genuinely about *this*
 * column. Visibility and order belong to the toolbar's Columns menu; width is the drag
 * handle on the header's edge, with a way back to fitting the contents here.
 *
 * Only a custom column can be renamed or deleted - a registration column is owned by the
 * form in Settings, and a built-in is part of the attendee row.
 */
export function ColumnMenu({ column, clip = false, onHide, onResetWidth, renameColumn, deleteColumn }: {
  column: ColumnDef;
  /**
   * Whether the label may be cut short, which only a dragged width should do. A column sized
   * by its contents must keep its whole label: a clippable one gives the browser licence to
   * squeeze every column to fit the page.
   */
  clip?: boolean;
  onHide: (key: string) => void;
  /** Only while the column has a dragged width: puts it back to fitting its contents. */
  onResetWidth?: () => void;
  renameColumn: Action;
  deleteColumn: Action;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const owned = column.source === "custom";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className={`-ml-2 gap-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground ${clip ? "max-w-full" : ""}`} title={clip ? column.label : undefined} />
          }
        >
          <span className={clip ? "truncate" : undefined}>{column.label}</span>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onHide(column.key)}>
              <EyeOff />
              Hide column
            </DropdownMenuItem>
            {onResetWidth && (
              <DropdownMenuItem onClick={onResetWidth}>
                <MoveHorizontal />
                Fit width to contents
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {owned && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 />
                  Delete column
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <form action={renameColumn}>
            <input type="hidden" name="key" value={column.key} />
            <DialogHeader>
              <DialogTitle>Rename column</DialogTitle>
              <DialogDescription>
                Renaming changes the heading everywhere it appears, including the attendance export. The answers already stored keep their values.
              </DialogDescription>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor="rename-label">Column name</FieldLabel>
              <Input id="rename-label" name="label" defaultValue={column.label} autoFocus required maxLength={40} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
              <SubmitButton>Rename</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {column.label} column?</AlertDialogTitle>
            <AlertDialogDescription>
              Every answer stored in it is deleted with it, for every attendee, and it leaves the attendance export. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <form action={deleteColumn}>
              <input type="hidden" name="key" value={column.key} />
              {/* The dialog's own action is only a Button, so a SubmitButton in its place
                  is the same control plus the working state. */}
              <SubmitButton className="bg-destructive text-white hover:bg-destructive/90">
                Delete column
              </SubmitButton>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
