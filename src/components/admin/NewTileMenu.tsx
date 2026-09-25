"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Link2, Map, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Kind = "tile" | "floor_plan";

const KINDS: { kind: Kind; icon: typeof Plus; label: string; what: string; title: string; hint: string }[] = [
  { kind: "tile", icon: Link2, label: "Link or page", what: "Opens a website, or a page inside the portal", title: "Add a tile", hint: "A tile can open a link, or a page inside the portal." },
  { kind: "floor_plan", icon: Map, label: "Floor plan", what: "Shows the venue layout inside the portal", title: "Add the floor plan", hint: "A preset tile that opens the venue layout inside the portal." },
];

/**
 * "New tile", the same one-button menu as "New activity" (NewActivityMenu): pick what kind of
 * tile, and its form opens. The floor plan is offered only while the event has none — there
 * is one venue layout, and `forms` simply leaves it out.
 *
 * The forms are rendered by the server page and handed in, so they stay server components
 * posting to server actions. The URL closes the dialog: the save action redirects, and when
 * the address changes the task that opened it is over.
 */
export function NewTileMenu({ forms, disabled }: { forms: Partial<Record<Kind, React.ReactNode>>; disabled?: boolean }) {
  const [which, setWhich] = useState<Kind | null>(null);

  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === url) { openedAt.current = url; return; }
    openedAt.current = url;
    setWhich(null);
  }, [url]);

  const offered = KINDS.filter((k) => forms[k.kind]);
  const current = KINDS.find((k) => k.kind === which);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" disabled={disabled} />}>
          <Plus />New tile<ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {offered.map(({ kind, icon: Icon, label, what }) => (
            <DropdownMenuItem key={kind} onClick={() => setWhich(kind)} className="items-start gap-3 py-2">
              <Icon className="mt-0.5" />
              <span className="flex flex-col">
                <span className="font-bold">{label}</span>
                <span className="text-xs text-muted-foreground">{what}</span>
              </span>
            </DropdownMenuItem>
          ))}
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
