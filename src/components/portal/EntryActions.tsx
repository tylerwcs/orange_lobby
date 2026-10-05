"use client";
import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * D391/D398: Edit and Delete on an entry the attendee may still change. In the challenge tracker
 * they sit in the ⋯ beside the entry (`menu`), the thumbnail itself opening the photos; on an
 * ordinary form they are two text links under the answers (`links`).
 *
 * `editForm` is rendered by the server, as the submit dialog's form is. Its action redirects back,
 * and the page keys this component by the entry's edit stamp, so a save remounts it closed and a
 * refusal leaves the dialog open with the toast saying why. Delete confirms first in its own
 * dialog, opened from the menu rather than inside it, since a menu closes on click.
 */
export function EntryActions({ title, editForm, remove, variant }: {
  /** The form's name, the edit dialog's heading. */
  title: string;
  editForm: React.ReactNode;
  remove: () => Promise<void>;
  variant: "menu" | "links";
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      {variant === "menu" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" aria-label="Edit or delete this entry" disabled={pending} aria-busy={pending}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}
          >
            {pending ? <Spinner /> : <MoreHorizontal aria-hidden className="size-5" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => setEditing(true)}><Pencil />Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}><Trash2 />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="flex items-center gap-3">
          <button type="button" className="underline" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="flex items-center gap-1 text-destructive underline disabled:opacity-60" disabled={pending} onClick={() => setConfirming(true)}>
            {pending && <Spinner />}Delete
          </button>
        </span>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[85vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
          <div className="flex flex-col gap-1 pr-8">
            <DialogTitle className="text-lg font-extrabold">{title}</DialogTitle>
            <DialogDescription>Change your answers and save. You can edit this until the end of today.</DialogDescription>
          </div>
          {editForm}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>It and its photos are removed for good, and it stops counting. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* Closed on confirm, as in RowActions: left open while the delete runs, it is a
                second confirm waiting to be pressed. */}
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { setConfirming(false); startTransition(() => remove()); }}>
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
