"use client";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Ellipsis, ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * How a sortable list (SortableList, ModuleList) lets a row's menu move it. The drag handle
 * and its arrow keys are the quick routes; these are the touch route, where HTML drag-and-drop
 * is unreliable. Menu items rather than a pair of arrow buttons on every row, so every list in
 * the admin shows one control per row: its ⋯ menu.
 */
export type RowMove = { up: (() => void) | null; down: (() => void) | null };
export const RowMoveContext = createContext<RowMove | null>(null);

/**
 * The ⋯ menu at the end of every admin list row: Edit, the row's own actions, moving it, and
 * Delete. The same menu on agenda rows, announcements, tiles, booths and checkpoints, so a row
 * reads the same wherever it is — a name on the left, one control on the right.
 *
 * `edit.form` is rendered by the server and opens in a dialog, like Modal's children: the save
 * action redirects, and the URL changing closes it. Delete confirms in an AlertDialog opened
 * from the menu rather than inside it: a menu closes on click, and a confirmation that closes
 * with it is no confirmation.
 */
export function RowActions({ name, edit, actions = [], links = [], remove, editOpen, onEditOpenChange }: {
  name: string;
  edit?: { title: string; hint?: string; form: React.ReactNode };
  /** Extra one-click actions, e.g. "Unpin" — already bound on the server. */
  actions?: { label: string; action: () => Promise<void> }[];
  /** Things to open, e.g. a printable sheet. External ones open in a new tab. */
  links?: { label: string; href: string; newTab?: boolean }[];
  /** `blocked` says why it cannot be removed right now; the item shows, disabled, with the reason. */
  remove?: { action: () => Promise<void>; message: string; label?: string; blocked?: string };
  /** For a row whose name also opens the editor (ModuleList): the dialog's state, held there. */
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
}) {
  const move = useContext(RowMoveContext);
  const [ownOpen, setOwnOpen] = useState(false);
  const editing = editOpen ?? ownOpen;
  const setEditing = onEditOpenChange ?? setOwnOpen;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const removeLabel = remove?.label ?? "Delete";

  // As in Modal: the edit form's action redirects, and when the address changes the task is over.
  const address = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === address) { openedAt.current = address; return; }
    openedAt.current = address;
    setEditing(false);
  }, [address, setEditing]);

  const hasTop = Boolean(edit || actions.length || links.length);
  const hasMove = Boolean(move && (move.up || move.down));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="icon-sm" aria-label={`More for ${name}`} disabled={pending} aria-busy={pending} />}
        >
          {pending ? <Spinner /> : <Ellipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {hasTop && (
            <DropdownMenuGroup>
              {edit && <DropdownMenuItem onClick={() => setEditing(true)}><Pencil />Edit</DropdownMenuItem>}
              {actions.map((a) => (
                <DropdownMenuItem key={a.label} onClick={() => startTransition(() => a.action())}>{a.label}</DropdownMenuItem>
              ))}
              {links.map((l) => (
                <DropdownMenuItem key={l.label} onClick={() => (l.newTab ? window.open(l.href, "_blank", "noopener") : window.location.assign(l.href))}>
                  {l.newTab && <ExternalLink />}{l.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {hasMove && move && (
            <>
              {hasTop && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={!move.up} onClick={() => move.up?.()}><ArrowUp />Move up</DropdownMenuItem>
                <DropdownMenuItem disabled={!move.down} onClick={() => move.down?.()}><ArrowDown />Move down</DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
          {remove && (
            <>
              {(hasTop || hasMove) && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" disabled={Boolean(remove.blocked)} onClick={() => setConfirming(true)}><Trash2 />{removeLabel}</DropdownMenuItem>
              {remove.blocked && <p className="px-2 pb-1.5 text-xs text-muted-foreground">{remove.blocked}</p>}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {edit && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{edit.title}</DialogTitle>
              {edit.hint && <DialogDescription>{edit.hint}</DialogDescription>}
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto">{edit.form}</div>
          </DialogContent>
        </Dialog>
      )}

      {remove && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{removeLabel} {name}?</AlertDialogTitle>
              <AlertDialogDescription>{remove.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {/* Closed on confirm: a dialog left open while the delete runs is a second
                  confirm waiting to be pressed. */}
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => { setConfirming(false); startTransition(() => remove.action()); }}
              >
                Yes, {removeLabel.toLowerCase()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

/**
 * Move up / Move down as two small buttons, for a sortable list whose rows have no ⋯ menu —
 * the Attendees table's column list, a checklist in a dialog. Reads the same RowMoveContext.
 */
export function RowMoveButtons({ label }: { label: string }) {
  const move = useContext(RowMoveContext);
  if (!move) return null;
  return (
    <span className="flex shrink-0">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label} up`} disabled={!move.up} onClick={() => move.up?.()}><ArrowUp /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label} down`} disabled={!move.down} onClick={() => move.down?.()}><ArrowDown /></Button>
    </span>
  );
}
