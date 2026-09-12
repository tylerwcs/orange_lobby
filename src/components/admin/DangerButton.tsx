"use client";
import { useTransition } from "react";
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
 */
export function DangerButton({ action, message, children }: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="destructive" disabled={pending} aria-busy={pending} />}>
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Working…" : children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => startTransition(() => action())}
          >
            Yes, delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
