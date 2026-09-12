"use client";
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
 * The dialog's action is the real submit, so this still lives inside its form.
 */
export function ConfirmButton({ message, children, className = "", confirmLabel = "Yes, continue" }: {
  message: string;
  children: React.ReactNode;
  className?: string;
  confirmLabel?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" className={className} />}>
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
            render={<button type="submit" />}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
