"use client";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * D681, D697: Leave the waiting list / Withdraw my registration, confirmed first as the cancel
 * section is. The action takes effect at once and redirects back to the link.
 */
export function QueueLeaveButton({ eventName, waiting, action }: {
  eventName: string;
  /** True on the waiting list, false for a pending registration. */
  waiting: boolean;
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={pending} aria-busy={pending}
        className="mt-5 h-11 border-destructive/40 text-destructive hover:bg-destructive/10">
        {pending && <Spinner data-icon="inline-start" />}
        {waiting ? "Leave the waiting list" : "Withdraw my registration"}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {waiting ? `Leave the waiting list for ${eventName}?` : `Withdraw your registration for ${eventName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {waiting
                ? "You lose your place in the queue straight away. If you join again later, you start at the back."
                : "Your place is given up straight away. If you register again later, you start over."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{waiting ? "Stay on the list" : "Keep my registration"}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirming(false); startTransition(() => action()); }}>
              {waiting ? "Yes, leave" : "Yes, withdraw"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * D695: the line for someone who sent the normal form after the last place went. The card is
 * drawn by the personal layout, and a layout is never given the query, so this reads `?filled=1`
 * here in the browser.
 */
export function FilledWhileRegistering() {
  const filled = useSearchParams().get("filled") === "1";
  if (!filled) return null;
  return (
    <p className="mt-4 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-balance">
      The last place went while you were registering, so we&apos;ve put you on the waiting list with your answers kept.
    </p>
  );
}
