"use client";
import { useRef } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * A submit guarded by a confirmation. It used to be window.confirm, which cannot be
 * styled, cannot be read by a screen reader as part of the page, and on some browsers is
 * suppressed entirely - a destructive action that silently proceeds.
 *
 * The confirmation CANNOT be a `<button type="submit">`. AlertDialogContent renders through
 * a Base UI Portal, so everything inside the dialog is moved to the end of <body> - out of
 * the form it was written in. A submit button with no owning form does nothing at all: no
 * submit event, no server action, no error. That is what made every Delete on this site a
 * silent no-op between the shadcn move and now.
 *
 * The trigger is the way back. It is not portalled - it renders exactly where it was
 * written, inside the form - so its `form` property is that form, and requestSubmit() fires
 * the real submit event React's `action` prop is listening for.
 *
 * Use DangerButton instead when there is no form to submit, or when the control has to sit
 * beside a Save button: forms cannot nest.
 */
export function ConfirmButton({ message, children, className = "", confirmLabel = "Yes, continue" }: {
  message: string;
  children: React.ReactNode;
  className?: string;
  confirmLabel?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button ref={trigger} type="button" variant="outline" className={className} />}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => trigger.current?.form?.requestSubmit()}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
