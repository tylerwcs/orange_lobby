"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KIND_META } from "../kinds/meta";
import type { ActivityKind } from "@/lib/types";

/**
 * One "New activity" button for every kind, instead of a button per kind: the kinds are
 * formats of the same thing (D179), and three look-alike buttons made the organiser read all
 * three to find the one they wanted. The menu says what each kind is for in a line; the form
 * behind it is unchanged. Only the kinds the event's add-ons allow are offered (D438).
 *
 * The forms are rendered by the server page and handed in, so they stay server components
 * posting to server actions. As in `Modal`, the URL closes the dialog: the add actions
 * redirect, and when the address changes the task that opened it is over.
 */
export function NewActivityMenu({ forms, kinds }: { forms: Record<ActivityKind, React.ReactNode>; kinds: readonly ActivityKind[] }) {
  const [which, setWhich] = useState<ActivityKind | null>(null);

  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === url) { openedAt.current = url; return; }
    openedAt.current = url;
    setWhich(null);
  }, [url]);

  const current = which ? { kind: which, ...KIND_META[which] } : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" />}>
          <Plus />New activity<ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {kinds.map((kind) => {
            const { icon: Icon, label, what } = KIND_META[kind];
            return (
              <DropdownMenuItem key={kind} onClick={() => setWhich(kind)} className="items-start gap-3 py-2">
                <Icon className="mt-0.5" />
                <span className="flex flex-col">
                  <span className="font-bold">{label}</span>
                  <span className="text-xs text-muted-foreground">{what}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={which !== null} onOpenChange={(open) => { if (!open) setWhich(null); }}>
        <DialogContent className="sm:max-w-2xl">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>{current.title}</DialogTitle>
                <DialogDescription>{current.hint}</DialogDescription>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto">{forms[current.kind]}</div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
