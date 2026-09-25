"use client";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Ellipsis, ExternalLink, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { moveItem } from "@/lib/reorder";

/**
 * What else can be done to the tab being edited: move it along the strip, see it as attendees
 * do, or delete it. Moving is here rather than by dragging the strip's tabs, because a tab is
 * also a link — a drag that starts on it is a click waiting to happen.
 */
export function InfoTabMenu({ title, ids, index, portalHref, reorder, remove }: {
  title: string;
  /** Every tab's id, in order, so a move sends the whole new order. */
  ids: string[];
  index: number;
  portalHref: string;
  reorder: (ids: string[]) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const move = (to: number) => startTransition(() => reorder(moveItem(ids, index, to)));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-sm" aria-label={`More for ${title}`} disabled={pending} aria-busy={pending} />}>
          {pending ? <Spinner /> : <Ellipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={index === 0} onClick={() => move(index - 1)}><ArrowLeft />Move left</DropdownMenuItem>
            <DropdownMenuItem disabled={index === ids.length - 1} onClick={() => move(index + 1)}><ArrowRight />Move right</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(portalHref, "_blank", "noopener")}><ExternalLink />View on portal</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}><Trash2 />Delete tab</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
            <AlertDialogDescription>Its content goes with it, and attendees stop seeing the tab.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { setConfirming(false); startTransition(() => remove()); }}
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
