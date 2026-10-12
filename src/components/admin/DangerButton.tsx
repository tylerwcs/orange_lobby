"use client";
import { useTransition, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A destructive action with no form of its own. ConfirmButton needs one, which makes it
 * unusable next to a Save button - a form cannot nest inside another form, and these two
 * belong in the same row. Calling the bound action inside a transition does the same job
 * without the element.
 *
 * `size` is the trigger's; `layer` lifts the confirm above a full-screen stage (the polaroid
 * camera's drawer sits at z-[110]).
 */
export function DangerButton({ action, message, children, size, layer }: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
  size?: "sm" | "default";
  layer?: string;
}) {
  const [pending, startTransition] = useTransition();
  // Closed on confirm, as in ConfirmButton: the action is not a Close, and a dialog left open
  // while the delete runs is a second "Yes, delete" waiting to be pressed.
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="destructive" size={size} disabled={pending} aria-busy={pending} />}>
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Working…" : children}
      </AlertDialogTrigger>
      <AlertDialogContent className={layer}>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => { setOpen(false); startTransition(() => action()); }}
          >
            Yes, delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
