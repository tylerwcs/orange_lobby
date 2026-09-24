"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronDown, FileText, Plus, Stamp } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Kind = "booking" | "submission" | "passport";

const KINDS: { kind: Kind; icon: typeof Plus; label: string; what: string; title: string; hint: string }[] = [
  { kind: "booking", icon: CalendarClock, label: "Sessions", what: "Attendees book a seat at a time", title: "Add a booking activity", hint: "Add its sessions once it exists." },
  { kind: "submission", icon: FileText, label: "Submission", what: "Attendees send you answers", title: "Add a submission activity", hint: "Add its questions now, or come back and edit them later." },
  { kind: "passport", icon: Stamp, label: "Passport", what: "Booths stamp a card", title: "Add a booth passport", hint: "Add its booths once it exists. Each booth gets a scanner link to print." },
];

/**
 * One "New activity" button for every kind, instead of a button per kind: the kinds are
 * formats of the same thing (D179), and three look-alike buttons made the organiser read all
 * three to find the one they wanted. The menu says what each kind is for in a line; the form
 * behind it is unchanged.
 *
 * The forms are rendered by the server page and handed in, so they stay server components
 * posting to server actions. As in `Modal`, the URL closes the dialog: the add actions
 * redirect, and when the address changes the task that opened it is over.
 */
export function NewActivityMenu({ forms }: { forms: Record<Kind, React.ReactNode> }) {
  const [which, setWhich] = useState<Kind | null>(null);

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
          <Plus />New activity<ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {KINDS.map(({ kind, icon: Icon, label, what }) => (
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
