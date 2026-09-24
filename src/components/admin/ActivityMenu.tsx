"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, Ellipsis, Pencil, Trash2 } from "lucide-react";
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

export type ActivityMenuProps = {
  name: string;
  /** The activity's own page. Left out on that page itself, where "Open page" would go nowhere. */
  pageHref?: string;
  settingsHref: string;
  exportHref: string;
  remove: () => Promise<void>;
  /** What deleting takes with it, in this kind's terms: sessions and bookings, submissions, booths. */
  removeMessage: string;
};

/**
 * The same menu behind every activity, whatever its kind, on the list and on its own page:
 * open it, edit it, export it, delete it. What each item DOES differs by kind — which export,
 * which delete — and the server works that out and binds it; this component only lays the
 * choices out the same way every time.
 *
 * Delete confirms in an AlertDialog opened from the menu rather than living inside it: a menu
 * closes on click, and a confirmation that closes with it is no confirmation.
 */
export function ActivityMenu({ name, pageHref, settingsHref, exportHref, remove, removeMessage }: ActivityMenuProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon-sm" aria-label={`More for ${name}`} disabled={pending} aria-busy={pending} />}
        >
          {pending ? <Spinner /> : <Ellipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            {pageHref && (
              <DropdownMenuItem onClick={() => router.push(pageHref)}>
                <ArrowRight />Open page
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push(settingsHref)}>
              <Pencil />Edit settings
            </DropdownMenuItem>
            {/* The response is an attachment, so assigning it downloads without leaving the page. */}
            <DropdownMenuItem onClick={() => window.location.assign(exportHref)}>
              <Download />Export
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>{removeMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* Closed on confirm, as in DangerButton: a dialog left open while the delete runs is
                a second "Yes, delete" waiting to be pressed. */}
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
