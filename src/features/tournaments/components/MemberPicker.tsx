"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PickButton } from "./FormButtons";

export type PickerMember = { id: string; name: string; alsoIn: string[]; inThis: boolean };

/**
 * D644: "Pick a member" for one sport - the group's members, searchable, each saying what else
 * they already play. Someone already in this squad shows, greyed, so the captain isn't left
 * wondering where they went. Each name is its own form, posting to the bound server action.
 */
export function MemberPicker({ sport, left, members, pick }: {
  sport: string;
  left: number;
  members: PickerMember[];
  pick: (attendeeId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? members.filter((m) => m.name.toLowerCase().includes(needle)) : members;
  }, [q, members]);
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" className="w-full border-dashed" />}>
        Pick a member
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3">
        <DialogTitle>Pick for {sport}</DialogTitle>
        <DialogDescription>{left} more place{left === 1 ? "" : "s"} in this squad.</DialogDescription>
        <label className="flex items-center gap-2 rounded-md border px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your group" aria-label="Search your group" className="h-10 w-full bg-transparent text-sm outline-none focus-visible:ring-0 focus-visible:outline-none" />
        </label>
        <ul className="-mx-1 flex flex-col overflow-y-auto">
          {shown.map((m) => (
            <li key={m.id}>
              {m.inThis ? (
                <div className="flex flex-col px-3 py-2 text-muted-foreground">
                  <span>{m.name}</span>
                  <span className="text-xs">already in this squad</span>
                </div>
              ) : (
                <form action={pick.bind(null, m.id)}>
                  <PickButton name={m.name} hint={m.alsoIn.length ? `also in ${m.alsoIn.join(", ")}` : null} />
                </form>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nobody in your group matches.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
