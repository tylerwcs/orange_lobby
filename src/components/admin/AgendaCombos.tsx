"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AGENDA_COLOURS } from "@/lib/agenda-colours";

/**
 * The two pickers on the agenda forms, as dropdowns rather than rows of pills.
 *
 * Both post through hidden inputs. The form itself is server-rendered and posts to a server
 * action, so the value a viewer chose has to exist as a real form field by the time they
 * submit — a Popover full of buttons posts nothing on its own.
 *
 * The trigger always says what is currently chosen, because a closed dropdown that reads
 * "Categories" tells you nothing about the session you are looking at.
 */

const triggerClass = "w-full justify-between font-normal";

/** Which categories may see a session. Multi-select; nothing chosen means everyone. */
export function CategoryCombo({ categories, name = "categories", defaultValue = [] }: {
  categories: string[];
  name?: string;
  defaultValue?: string[];
}) {
  const [chosen, setChosen] = useState<string[]>(defaultValue);
  const toggle = (c: string) =>
    setChosen((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  if (categories.length === 0) {
    return (
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Who can see it</span>
        <p className="text-xs text-muted-foreground">
          Everyone. Add attendees with categories and you can restrict a session to some of them.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Who can see it</span>
      {chosen.map((c) => <input key={c} type="hidden" name={name} value={c} />)}
      <Popover>
        <PopoverTrigger render={<Button type="button" variant="outline" className={triggerClass} />}>
          <span className="truncate">{chosen.length === 0 ? "Everyone" : chosen.join(", ")}</span>
          <ChevronDown data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          {categories.map((c) => {
            const on = chosen.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={on}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent"
              >
                <Check size={16} className={on ? "opacity-100" : "opacity-0"} aria-hidden="true" />
                {c}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">Choose none for everyone.</p>
    </div>
  );
}

/** The colour a session carries. Single-select, with None first. */
export function ColourCombo({ name = "color", defaultValue = null }: { name?: string; defaultValue?: string | null }) {
  const [chosen, setChosen] = useState<string>(defaultValue ?? "");
  const current = AGENDA_COLOURS.find((c) => c.key === chosen);

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Colour</span>
      <input type="hidden" name={name} value={chosen} />
      <Popover>
        <PopoverTrigger render={<Button type="button" variant="outline" className={triggerClass} />}>
          <span className="flex items-center gap-2 truncate">
            {current && <Swatch tint={current.tintClass} ink={current.inkClass} />}
            {current ? current.label : "None"}
          </span>
          <ChevronDown data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          <ColourRow label="None" on={chosen === ""} onPick={() => setChosen("")} />
          {AGENDA_COLOURS.map((c) => (
            <ColourRow
              key={c.key}
              label={c.label}
              on={chosen === c.key}
              onPick={() => setChosen(c.key)}
              swatch={<Swatch tint={c.tintClass} ink={c.inkClass} />}
            />
          ))}
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">Groups sessions on the agenda. Attendees see it too.</p>
    </div>
  );
}

/**
 * The colour as it will actually look: the pastil fill a session sits on, with its ink down
 * the leading edge. A dot of the ink alone would promise a solid colour the agenda never
 * shows.
 */
function Swatch({ tint, ink }: { tint: string; ink: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block h-4 w-6 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-foreground/15 ${tint}`}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${ink}`} />
    </span>
  );
}

function ColourRow({ label, on, onPick, swatch }: { label: string; on: boolean; onPick: () => void; swatch?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent"
    >
      <Check size={16} className={on ? "opacity-100" : "opacity-0"} aria-hidden="true" />
      {swatch}
      {label}
    </button>
  );
}
