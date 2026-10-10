"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Gift, Hand, Plus, Trophy } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GameKind } from "../config";

const KINDS: { kind: GameKind; icon: typeof Plus; label: string; what: string; hint: string }[] = [
  { kind: "tap_race", icon: Hand, label: "Tap race", what: "Teams tap their phones to race", hint: "You pick the lanes — table, category or solo — when you start it." },
  { kind: "survival", icon: Trophy, label: "Last one standing", what: "Wrong answers are out until one is left", hint: "Add its questions on the next page." },
  { kind: "draw", icon: Gift, label: "Lucky draw", what: "Draw winners from who checked in", hint: "Pick the checkpoint and add prizes on the next page." },
];

/**
 * One "New game" button for every kind, like "New activity". The forms are rendered by the
 * server page and handed in, so they post straight to server actions; the create action
 * redirects to the game's editor and the URL change closes the dialog.
 */
export function NewGameMenu({ forms, kinds }: { forms: Record<GameKind, React.ReactNode>; kinds: readonly GameKind[] }) {
  const [which, setWhich] = useState<GameKind | null>(null);

  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === url) { openedAt.current = url; return; }
    openedAt.current = url;
    setWhich(null);
  }, [url]);

  const current = KINDS.find((k) => k.kind === which);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" />}>
          <Plus />New game<ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {KINDS.filter((k) => kinds.includes(k.kind)).map(({ kind, icon: Icon, label, what }) => (
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
        <DialogContent>
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>New {current.label.toLowerCase()}</DialogTitle>
                <DialogDescription>{current.hint}</DialogDescription>
              </DialogHeader>
              {forms[current.kind]}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
