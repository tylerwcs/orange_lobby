import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The save button of every long admin form, in a bar that sticks to the bottom of the screen
 * while the form is on it, so Save is in reach from anywhere in a page of fields and does not
 * wait at the far end of it. It must sit inside its form, as the form's last child: sticky
 * keeps it within the form, so it settles at the form's end once the form scrolls past.
 *
 * `inCard` for a form inside a Card (an activity's Setup): the bar reaches the card's edges
 * rather than the page's.
 */
export function SaveBar({ label = "Save", note, inCard = false }: { label?: string; note?: string; inCard?: boolean }) {
  return (
    <div
      className={inCard
        ? "sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur"
        : "sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6 2xl:-mx-8 2xl:px-8"}
    >
      <SubmitButton>{label}</SubmitButton>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
