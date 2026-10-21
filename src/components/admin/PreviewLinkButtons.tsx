"use client";
import { useState, useTransition } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * D715: Create, Replace and Turn off for the draft preview link. Plain buttons calling the
 * actions, like StatusPicker beside them: this sits inside Settings' one form, and a form may not
 * hold another. Replace and Turn off ask first - both stop every copy already sent.
 */
export function PreviewLinkButtons({ exists, create, replace, turnOff }: {
  exists: boolean;
  create: () => Promise<void>;
  replace: () => Promise<void>;
  turnOff: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  if (!exists) {
    return (
      <Button type="button" variant="outline" className="self-start" disabled={pending} aria-busy={pending}
        onClick={() => startTransition(() => create())}>
        {pending && <Spinner data-icon="inline-start" />}
        Create preview link
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Confirm label="Replace link" pending={pending} run={() => startTransition(() => replace())}
        message="Replace the preview link? The old one stops working at once, for everyone you sent it to." />
      <Confirm label="Turn off link" pending={pending} run={() => startTransition(() => turnOff())}
        message="Turn off the preview link? Anyone who had it sees Coming soon again." />
    </div>
  );
}

function Confirm({ label, message, pending, run }: { label: string; message: string; pending: boolean; run: () => void }) {
  // Closed on confirm, as in DangerButton: a dialog left open while the action runs is a second press waiting to happen.
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={pending} />}>{label}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setOpen(false); run(); }}>Yes, continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
