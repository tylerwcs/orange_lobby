import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The save button of every long admin form, in a bar that sticks to the bottom of the screen
 * while the form is on it, so Save is in reach from anywhere in a page of fields and does not
 * wait at the far end of it. It must sit inside its form, as the form's last child: sticky
 * keeps it within the form, so it settles at the form's end once the form scrolls past.
 *
 * `inCard` for a form inside a Card (an activity's Setup): the bar reaches the card's edges
 * rather than the page's.
 *
 * `unsavedNote` (D778) replaces `note` while the form carries `data-dirty`, which UnsavedGuard
 * sets on a Settings tab's form once it is edited. Pure CSS, so the bar stays a server component.
 */
export function SaveBar({ label = "Save", note, unsavedNote, inCard = false }: { label?: string; note?: string; unsavedNote?: string; inCard?: boolean }) {
  return (
    <div
      className={inCard
        ? "sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur"
        : "sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6 2xl:-mx-8 2xl:px-8"}
    >
      <SubmitButton>{label}</SubmitButton>
      {note && <span className={unsavedNote ? "text-xs text-muted-foreground [form[data-dirty]_&]:hidden" : "text-xs text-muted-foreground"}>{note}</span>}
      {unsavedNote && <span className="hidden text-xs font-semibold text-foreground [form[data-dirty]_&]:inline">{unsavedNote}</span>}
    </div>
  );
}
