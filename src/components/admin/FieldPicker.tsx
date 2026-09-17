"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * The fields chosen for the scan card, as a searchable multi-select over the event's own
 * fields rather than a box asking for raw storage keys.
 *
 * Posts through hidden inputs, same reason as the agenda combos: the form is server-rendered
 * and posts to a server action, so what's chosen has to exist as a real field by submit time.
 *
 * A stored value that matches none of the event's fields still renders — as its own row,
 * ticked and labelled "(stored)" — so a name that predates a since-deleted field, or a
 * label typed into the old free-text box that this replaces, is not silently dropped on the
 * next save.
 */
export function FieldPicker({ name, fields, selected, max }: {
  name: string;
  fields: { key: string; label: string }[];
  selected: string[];
  max: number;
}) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [filter, setFilter] = useState("");

  // A stored value may spell a field by key or by label (the free-text box this replaces
  // wrote labels). This is the entry actually sitting in `chosen` for a given field, if any
  // — clicking a row has to remove *that* spelling, or picking it again would just add a
  // second entry for the same field under a different spelling.
  const chosenEntryFor = (f: { key: string; label: string }) =>
    chosen.find((v) => v === f.key || v.toLowerCase() === f.label.toLowerCase());

  const atCap = chosen.length >= max;

  const toggleField = (f: { key: string; label: string }) => {
    const existing = chosenEntryFor(f);
    setChosen((prev) => (existing ? prev.filter((v) => v !== existing) : prev.length >= max ? prev : [...prev, f.key]));
  };
  const removeOrphan = (value: string) => setChosen((prev) => prev.filter((v) => v !== value));

  const orphans = chosen.filter((v) => !fields.some((f) => f.key === v || f.label.toLowerCase() === v.toLowerCase()));
  const visible = fields.filter((f) => f.label.toLowerCase().includes(filter.trim().toLowerCase()));
  const labelFor = (value: string) => fields.find((f) => f.key === value || f.label.toLowerCase() === value.toLowerCase())?.label ?? value;

  return (
    <div className="grid gap-2">
      {chosen.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <Popover>
        <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between font-normal" />}>
          <span className="truncate">{chosen.length === 0 ? "None chosen" : chosen.map(labelFor).join(", ")}</span>
          <ChevronDown data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1.5">
          {fields.length === 0 && orphans.length === 0 ? (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              This event has no fields yet. Add one under Registration or on the attendee list first.
            </p>
          ) : (
            <>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter fields…"
                aria-label="Filter fields"
                className="mb-1"
              />
              {atCap && <p className="px-1.5 pb-1 text-xs text-muted-foreground">Up to {max} at a time — remove one to add another.</p>}
              <div className="max-h-64 overflow-y-auto">
                {orphans.map((v) => (
                  <Row key={v} label={`${v} (stored)`} on onPick={() => removeOrphan(v)} disabled={false} />
                ))}
                {visible.length === 0 && orphans.length === 0 && (
                  <p className="px-1.5 py-2 text-xs text-muted-foreground">No fields match &ldquo;{filter}&rdquo;.</p>
                )}
                {visible.map((f) => {
                  const on = chosenEntryFor(f) !== undefined;
                  return <Row key={f.key} label={f.label} on={on} onPick={() => toggleField(f)} disabled={!on && atCap} />;
                })}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Row({ label, on, onPick, disabled }: { label: string; on: boolean; onPick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={on}
      className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
    >
      <Check size={16} className={on ? "opacity-100" : "opacity-0"} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
