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
export function Modal({ title, hint, trigger, icon, variant = "outline", iconOnly = false, children }: {
  title: string;
  hint?: string;
  trigger: string;
  icon?: IconName;
  variant?: Variant;
  /** Square button, no label - `trigger` becomes the accessible name and the tooltip. */
  iconOnly?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === url) { openedAt.current = url; return; }
    openedAt.current = url;
    setOpen(false);
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
