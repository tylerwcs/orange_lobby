"use client";
import { useState, useTransition } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * D585/D593: Cancel my registration - which now asks the organiser, who approves (D594). "me" is the card at the bottom of the Me page; "draft" is the small
 * link under Coming soon. Both confirm first; the action re-checks every rule (D586).
 */
export function CancelSection({ eventName, until, action, variant }: {
  eventName: string;
  /** The cut-off as "21 Oct, 18:00", or null for none. */
  until: string | null;
  action: () => Promise<void>;
  variant: "me" | "draft";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const open = () => setConfirming(true);

  const dialog = (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ask to cancel your registration for {eventName}?</AlertDialogTitle>
          <AlertDialogDescription>Your request goes to the organiser. You stay registered until they approve it.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my place</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => { setConfirming(false); startTransition(() => action()); }}>
            Yes, ask to cancel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (variant === "draft") {
    return (
      <>
        <button type="button" onClick={open} disabled={pending} aria-busy={pending}
          className="min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {pending ? "Sending…" : "Can't make it? Cancel my registration"}
        </button>
        {dialog}
      </>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-extrabold">Can&apos;t make it?</CardTitle></CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {until ? `You can cancel your registration until ${until}.` : "You can cancel your registration."}
        </p>
        <Button type="button" variant="outline" onClick={open} disabled={pending} aria-busy={pending}
          className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10">
          {pending && <Spinner data-icon="inline-start" />}
          Cancel my registration
        </Button>
        {dialog}
      </CardContent>
    </Card>
  );
}
