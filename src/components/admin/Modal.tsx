"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

type Variant = React.ComponentProps<typeof Button>["variant"];

/**
 * A task that interrupts the page it was launched from.
 *
 * Children are rendered by the server parent, so the forms inside stay server components
 * posting to server actions. Those actions redirect on success - but the redirect usually
 * lands back inside the same page component, so the dialog is not unmounted by it. The
 * URL is therefore what closes it: when the address changes, the task that opened this
 * dialog is over.
 */
export function Modal({ title, hint, trigger, icon, variant = "outline", iconOnly = false, defaultOpen = false, children }: {
  title: string;
  hint?: string;
  trigger: string;
  icon?: IconName;
  variant?: Variant;
  /** Square button, no label - `trigger` becomes the accessible name and the tooltip. */
  iconOnly?: boolean;
  /**
   * Open on mount - for a caller whose own GET navigation put the modal's content in the URL
   * (e.g. `?from=`), so the page loads straight into it. While this stays true, a URL change is
   * read as more of that caller's own navigation, not the "task is over" signal below, so the
   * modal does not close under it; the caller drops it back to false once its own URL param is
   * gone, which does close the modal (see Build from column).
   */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Read via a ref, not the dependency array, so a `defaultOpen` change alone never re-fires
  // the closing effect below - only a URL change does, same as before `defaultOpen` existed.
  const stayOpen = useRef(defaultOpen);
  useEffect(() => { stayOpen.current = defaultOpen; }, [defaultOpen]);

  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === url) { openedAt.current = url; return; }
    openedAt.current = url;
    if (!stayOpen.current) setOpen(false);
  }, [url]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={iconOnly ? "icon" : "default"}
            {...(iconOnly ? { "aria-label": trigger, title: trigger } : {})}
          />
        }
      >
        {icon && <Icon name={icon} size={18} />}
        {!iconOnly && trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {hint && <DialogDescription>{hint}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
