"use client";
import { useRef } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass, type ButtonVariant } from "@/components/ui/Card";

/**
 * A task that interrupts the page it was launched from. Built on the native `<dialog>`
 * so focus trapping, Escape, focus restore and inertness of the page behind come from
 * the platform rather than from a hand-rolled imitation.
 *
 * Children are rendered by the server parent, so the forms inside stay server components
 * posting to server actions. Those actions redirect on success, which navigates the page
 * and takes the dialog with it — there is no "close on success" to wire up.
 */
export function Modal({ title, hint, trigger, icon, variant = "secondary", children }: {
  title: string;
  hint?: string;
  trigger: string;
  icon?: IconName;
  variant?: ButtonVariant;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button type="button" className={buttonClass(variant)} onClick={() => ref.current?.showModal()}>
        {icon && <Icon name={icon} size={18} />}{trigger}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        // A click that lands on the dialog element itself is a click on the backdrop;
        // anything inside the panel hits a child and is left alone.
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className="w-[min(92vw,720px)] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-[var(--shadow-card)] backdrop:bg-ink/40"
      >
        <div className="flex items-start gap-4 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold">{title}</h2>
            {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors duration-150 hover:bg-canvas">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </dialog>
    </>
  );
}
