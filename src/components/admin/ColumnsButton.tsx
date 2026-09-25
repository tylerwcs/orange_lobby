"use client";
import { ChevronDown, Columns3 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/lib/columns";

/**
 * Which columns the table shows. This is the answer to an event whose registration form
 * asks seven questions: every answer is a column, which is fifteen of them for the KOM,
 * and nobody reads fifteen columns at once. They stay one tick away, and the attendee
 * panel shows all of them for one person regardless.
 *
 * One flat list, in the table's own order. It used to be grouped by where a column came
 * from — the attendee row, the registration form, the organiser, a breakout round — but
 * that is a distinction the person ticking a box does not have and does not need: they are
 * looking for a column by its name. `source` still decides what a column's own header menu
 * offers, which is where it actually matters.
 */
export function ColumnsButton({ columns, hidden, onToggle, onShowAll, onArrange, onAddColumn }: {
  columns: ColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  onArrange: () => void;
  onAddColumn: () => void;
}) {
  const hiddenCount = columns.filter((c) => hidden.has(c.key)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-1.5" />}>
        <Columns3 data-icon="inline-start" />
        Columns
        {hiddenCount > 0 && <span className="text-muted-foreground">· {hiddenCount} hidden</span>}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuGroup>
          {columns.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={!hidden.has(c.key)}
              onCheckedChange={(checked) => onToggle(c.key, checked)}
              /* Keeps the menu open: hiding four columns should be four ticks, not four
                 round trips through the trigger. */
              closeOnClick={false}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {hiddenCount > 0 && <DropdownMenuItem onClick={onShowAll}>Show all columns</DropdownMenuItem>}
          <DropdownMenuItem onClick={onArrange}>Manage columns…</DropdownMenuItem>
          <DropdownMenuItem onClick={onAddColumn}>Add a column…</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
